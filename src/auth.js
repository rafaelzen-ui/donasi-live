import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {findUser,findUserByEmail,createUser} from "./db.js";

const secret=()=>process.env.JWT_SECRET;

export const safeUser=u=>({
  id:u.id,
  email:u.email,
  displayName:u.displayName,
  slug:u.slug,
  youtube:u.youtube?{
    channel:u.youtube.channel,
    connectedAt:u.youtube.connectedAt
  }:null,
  settings:u.settings
});

export function sign(u){
  const s=secret();
  if(!s) throw new Error("JWT_SECRET belum dikonfigurasi.");
  return jwt.sign({sub:u.id},s,{expiresIn:"7d"});
}

export async function register(email,password,displayName){
  const normalizedEmail=String(email||"").toLowerCase().trim();
  const name=String(displayName||"").trim();

  if(!normalizedEmail || !name || !password)
    throw new Error("Nama, email, dan password wajib diisi.");

  if(password.length<8)
    throw new Error("Password minimal 8 karakter.");

  if(await findUserByEmail(normalizedEmail))
    throw new Error("Email sudah terdaftar.");

  const base=name.toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-|-$/g,"") || "streamer";

  const slug=base+"-"+crypto.randomBytes(3).toString("hex");

  const u={
    id:crypto.randomUUID(),
    email:normalizedEmail,
    passwordHash:await bcrypt.hash(password,12),
    displayName:name,
    slug,
    settings:{
      mediaMin:25000,
      maxDuration:60,
      moderation:true
    }
  };

  return createUser(u);
}

export const verifyPassword=(p,h)=>bcrypt.compare(p,h);

export async function auth(req,res,next){
  try{
    const h=req.headers.authorization||"";
    if(!h.startsWith("Bearer "))
      return res.status(401).json({success:false,message:"Login diperlukan."});

    const s=secret();
    if(!s)
      return res.status(500).json({success:false,message:"JWT_SECRET belum dikonfigurasi."});

    const p=jwt.verify(h.slice(7),s);
    req.user=await findUser(p.sub);

    if(!req.user)
      return res.status(401).json({success:false,message:"User tidak ditemukan."});

    next();
  }catch(e){
    res.status(401).json({success:false,message:"Token tidak valid."});
  }
}
