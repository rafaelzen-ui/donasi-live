import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {findUser,findUserByEmail,createUser} from "./db.js";
const secret=()=>process.env.JWT_SECRET;
export const safeUser=u=>({id:u.id,email:u.email,displayName:u.displayName,slug:u.slug,youtube:u.youtube?{channel:u.youtube.channel,connectedAt:u.youtube.connectedAt}:null,settings:u.settings});
export function sign(u){return jwt.sign({sub:u.id},secret(),{expiresIn:"7d"})}
export async function register(email,password,displayName){
 if(findUserByEmail && await findUserByEmail(email)) throw Error("Email sudah terdaftar.");
 const base=displayName.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"streamer";
 const slug=base+"-"+crypto.randomBytes(3).toString("hex");
 const u={id:crypto.randomUUID(),email:email.toLowerCase().trim(),passwordHash:await bcrypt.hash(password,12),displayName:displayName.trim(),slug,settings:{mediaMin:25000,maxDuration:60,moderation:true}};
 return createUser(u);
}
export const verifyPassword=(p,h)=>bcrypt.compare(p,h);
export async function auth(req,res,next){try{const h=req.headers.authorization||"";if(!h.startsWith("Bearer "))return res.status(401).json({success:false,message:"Login diperlukan."});const p=jwt.verify(h.slice(7),secret());req.user=await findUser(p.sub);if(!req.user)return res.status(401).json({success:false,message:"User tidak ditemukan."});next()}catch(e){res.status(401).json({success:false,message:"Token tidak valid."})}}
