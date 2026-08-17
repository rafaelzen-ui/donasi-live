import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import crypto from "crypto";
import {initDb,findUser,findUserByEmail,createUser,updateUser,createDonation,getDonation,updateDonation,streamerDonations,createMedia,getMedia,updateMedia,streamerMedia,stats} from "./db.js";
import {auth,register,verifyPassword,sign,safeUser} from "./auth.js";
import {channels,createPayment,verifyWebhook} from "./paymenku.js";
import {authUrl,exchange,channel} from "./youtube.js";

const app=express(),PORT=process.env.PORT||3000;
const subscribers=new Map(),oauthStates=new Map();
app.use(cors({origin:true}));
app.use("/api/payment/webhook",express.raw({type:"application/json"}));
app.use(express.json({limit:"1mb"}));
app.use(express.static("public"));
const emit=(uid,event,data)=>{for(const r of subscribers.get(uid)||[]){try{r.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)}catch{}}};

app.get("/health",(_,res)=>res.json({ok:true,service:"donasi-live"}));
app.post("/api/auth/register",async(req,res)=>{try{const{email,password,displayName}=req.body||{};if(!email||!displayName||!password||password.length<8)return res.status(400).json({success:false,message:"Nama, email, password minimal 8 karakter wajib diisi."});const u=await register(email,password,displayName);res.json({success:true,token:sign(u),user:safeUser(u)})}catch(e){res.status(400).json({success:false,message:e.message})}});
app.post("/api/auth/login",async(req,res)=>{const u=await findUserByEmail(req.body?.email||"");if(!u||!(await verifyPassword(req.body?.password||"",u.passwordHash)))return res.status(401).json({success:false,message:"Email atau password salah."});res.json({success:true,token:sign(u),user:safeUser(u)})});
app.get("/api/me",auth,(req,res)=>res.json({success:true,user:safeUser(req.user)}));
app.get("/api/channels",(_,res)=>res.json({success:true,channels}));

app.get("/api/public/streamer/:slug",async(req,res)=>{const {pool}=await import("./db.js");const r=await pool.query("SELECT id,display_name,slug,settings FROM users WHERE slug=$1",[req.params.slug]);if(!r.rows[0])return res.status(404).json({success:false,message:"Streamer tidak ditemukan."});res.json({success:true,streamer:{id:r.rows[0].id,displayName:r.rows[0].display_name,slug:r.rows[0].slug,settings:r.rows[0].settings}})});

app.get("/api/integrations/youtube/start",auth,(req,res)=>{if(!process.env.GOOGLE_CLIENT_ID)return res.status(503).send("Google OAuth belum dikonfigurasi.");const state=crypto.randomBytes(24).toString("hex");oauthStates.set(state,{uid:req.user.id,exp:Date.now()+600000});res.redirect(authUrl(state))});
app.get("/api/integrations/youtube/callback",async(req,res)=>{try{const s=oauthStates.get(req.query.state);if(!s||s.exp<Date.now())throw Error("OAuth state expired");oauthStates.delete(req.query.state);const t=await exchange(req.query.code);const ch=await channel(t.access_token);await updateUser(s.uid,{youtube:{channel:ch,accessToken:t.access_token,refreshToken:t.refresh_token||null,connectedAt:new Date().toISOString()}});res.redirect("/dashboard.html?youtube=connected")}catch(e){res.redirect("/dashboard.html?youtube=error")}});

app.post("/api/donations",async(req,res)=>{try{const{streamerId,donorName,amount,message,channel,mediaUrl}=req.body||{},n=Number(amount),streamer=await findUser(streamerId);if(!streamer||!donorName||!Number.isInteger(n)||n<1000||!channels.some(x=>x.code===channel))return res.status(400).json({success:false,message:"Data donasi tidak valid."});const id=`DON-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;const d=await createDonation({id,streamerId,donorName:donorName.trim(),amount:n,message:String(message||"").slice(0,250),channel,mediaUrl:mediaUrl||null,status:"PENDING"});const p=await createPayment({referenceId:id,amount:n,channel,customerName:d.donorName,message:d.message});const saved=await updateDonation(id,{paymentId:p.paymentId,payment:p});res.json({success:true,donation:saved})}catch(e){res.status(502).json({success:false,message:e.message})}});

app.post("/api/payment/webhook",async(req,res)=>{const raw=req.body;if(!Buffer.isBuffer(raw)||!verifyWebhook(raw,req))return res.status(401).json({success:false,message:"Invalid webhook signature"});let j;try{j=JSON.parse(raw.toString())}catch{return res.status(400).json({success:false})}const x=j.data||j,ref=x.reference_id||x.reference||x.merchant_reference,trx=x.trx_id||x.transaction_id||x.id,s=String(x.status||x.payment_status||"").toUpperCase(),d=await getDonation(ref||trx);if(!d)return res.json({success:true,ignored:true});const status=["PAID","SUCCESS","SUCCEEDED","SETTLED","COMPLETED"].includes(s)?"PAID":["EXPIRED","FAILED","CANCELLED","CANCELED"].includes(s)?s:"PENDING";const u=await updateDonation(d.id,{status,paymentId:trx||d.paymentId,payment:x,paidAt:status==="PAID"?(d.paidAt||new Date().toISOString()):d.paidAt});if(status==="PAID"&&d.status!=="PAID"){if(d.mediaUrl){await createMedia({id:crypto.randomUUID(),donationId:d.id,streamerId:d.streamerId,url:d.mediaUrl,title:d.message||"Media Share",amount:d.amount,status:"PENDING_REVIEW"})}emit(d.streamerId,"donation_paid",u)}res.json({success:true})});

app.get("/api/dashboard",auth,async(req,res)=>res.json({success:true,stats:await stats(req.user.id),donations:await streamerDonations(req.user.id),media:await streamerMedia(req.user.id)}));
app.patch("/api/settings",auth,async(req,res)=>res.json({success:true,user:safeUser(await updateUser(req.user.id,{settings:{...req.user.settings,...req.body}}))}));
app.post("/api/media/:id/approve",auth,async(req,res)=>{const m=await getMedia(req.params.id);if(!m||m.streamerId!==req.user.id)return res.status(404).json({success:false});const u=await updateMedia(m.id,{status:"QUEUED",approvedAt:new Date().toISOString()});emit(req.user.id,"media_queued",u);res.json({success:true,media:u})});
app.post("/api/media/:id/reject",auth,async(req,res)=>{const m=await getMedia(req.params.id);if(!m||m.streamerId!==req.user.id)return res.status(404).json({success:false});res.json({success:true,media:await updateMedia(m.id,{status:"REJECTED"})})});
app.get("/api/stream/events",auth,(req,res)=>{res.set({"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive"});res.flushHeaders?.();if(!subscribers.has(req.user.id))subscribers.set(req.user.id,new Set());subscribers.get(req.user.id).add(res);res.write("event: ready\ndata: {}\n\n");req.on("close",()=>subscribers.get(req.user.id)?.delete(res))});
app.get("/api/overlay/:id/events",(req,res)=>{res.set({"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive"});res.flushHeaders?.();if(!subscribers.has(req.params.id))subscribers.set(req.params.id,new Set());subscribers.get(req.params.id).add(res);res.write("event: ready\ndata: {}\n\n");req.on("close",()=>subscribers.get(req.params.id)?.delete(res))});
app.get("/overlay/:id",(_,res)=>res.sendFile(path.resolve("public/overlay.html")));
app.get("/donate/:slug",(_,res)=>res.sendFile(path.resolve("public/donate.html")));
app.get("*splat",(_,res)=>res.sendFile(path.resolve("public/index.html")));

await initDb();
app.listen(PORT,()=>console.log(`Donasi.Live listening on ${PORT}`));
