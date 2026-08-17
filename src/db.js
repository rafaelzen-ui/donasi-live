import pg from "pg";
const {Pool}=pg;
if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL wajib diisi.");
export const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false});

export async function initDb(){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS users(
   id UUID PRIMARY KEY,
   email TEXT UNIQUE NOT NULL,
   password_hash TEXT NOT NULL,
   display_name TEXT NOT NULL,
   slug TEXT UNIQUE NOT NULL,
   youtube JSONB,
   settings JSONB NOT NULL DEFAULT '{"mediaMin":25000,"maxDuration":60,"moderation":true}',
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS donations(
   id TEXT PRIMARY KEY,
   streamer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   donor_name TEXT NOT NULL,
   amount BIGINT NOT NULL,
   message TEXT DEFAULT '',
   channel TEXT NOT NULL,
   media_url TEXT,
   status TEXT NOT NULL DEFAULT 'PENDING',
   payment_id TEXT,
   payment JSONB,
   paid_at TIMESTAMPTZ,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE INDEX IF NOT EXISTS donations_streamer_created_idx ON donations(streamer_id,created_at DESC);
 CREATE TABLE IF NOT EXISTS media(
   id UUID PRIMARY KEY,
   donation_id TEXT REFERENCES donations(id) ON DELETE CASCADE,
   streamer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   url TEXT NOT NULL,
   title TEXT DEFAULT '',
   amount BIGINT NOT NULL,
   status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   approved_at TIMESTAMPTZ,
   played_at TIMESTAMPTZ
 );
 CREATE INDEX IF NOT EXISTS media_streamer_status_idx ON media(streamer_id,status,created_at);
 `);
}
const userRow=r=>r.rows[0]&&mapUser(r.rows[0]);
function mapUser(x){return {id:x.id,email:x.email,passwordHash:x.password_hash,displayName:x.display_name,slug:x.slug,youtube:x.youtube,settings:x.settings,createdAt:x.created_at};}
export async function findUserByEmail(email){const r=await pool.query("SELECT * FROM users WHERE LOWER(email)=LOWER($1)",[email]);return userRow(r)}
export async function findUser(id){const r=await pool.query("SELECT * FROM users WHERE id=$1",[id]);return userRow(r)}
export async function createUser(u){await pool.query("INSERT INTO users(id,email,password_hash,display_name,slug,youtube,settings) VALUES($1,$2,$3,$4,$5,$6,$7)",[u.id,u.email,u.passwordHash,u.displayName,u.slug,null,JSON.stringify(u.settings)]);return u}
export async function updateUser(id,p){const cur=await findUser(id);if(!cur)return null;const n={...cur,...p};await pool.query("UPDATE users SET display_name=$2,slug=$3,youtube=$4,settings=$5 WHERE id=$1",[id,n.displayName,n.slug,n.youtube?JSON.stringify(n.youtube):null,JSON.stringify(n.settings)]);return n}
export async function createDonation(d){await pool.query("INSERT INTO donations(id,streamer_id,donor_name,amount,message,channel,media_url,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[d.id,d.streamerId,d.donorName,d.amount,d.message,d.channel,d.mediaUrl,d.status]);return d}
export async function getDonation(id){const r=await pool.query("SELECT * FROM donations WHERE id=$1 OR payment_id=$1 LIMIT 1",[id]);return r.rows[0]?mapDonation(r.rows[0]):null}
export async function updateDonation(id,p){const cur=await getDonation(id);if(!cur)return null;const n={...cur,...p};await pool.query("UPDATE donations SET status=$2,payment_id=$3,payment=$4,paid_at=$5 WHERE id=$1",[cur.id,n.status,n.paymentId,n.payment?JSON.stringify(n.payment):null,n.paidAt||null]);return n}
export async function streamerDonations(uid){const r=await pool.query("SELECT * FROM donations WHERE streamer_id=$1 ORDER BY created_at DESC LIMIT 100",[uid]);return r.rows.map(mapDonation)}
export async function createMedia(m){await pool.query("INSERT INTO media(id,donation_id,streamer_id,url,title,amount,status) VALUES($1,$2,$3,$4,$5,$6,$7)",[m.id,m.donationId,m.streamerId,m.url,m.title,m.amount,m.status]);return m}
export async function getMedia(id){const r=await pool.query("SELECT * FROM media WHERE id=$1",[id]);return r.rows[0]?mapMedia(r.rows[0]):null}
export async function updateMedia(id,p){const m=await getMedia(id);if(!m)return null;const n={...m,...p};await pool.query("UPDATE media SET status=$2,approved_at=$3,played_at=$4 WHERE id=$1",[id,n.status,n.approvedAt||null,n.playedAt||null]);return n}
export async function streamerMedia(uid){const r=await pool.query("SELECT * FROM media WHERE streamer_id=$1 ORDER BY created_at ASC",[uid]);return r.rows.map(mapMedia)}
export async function stats(uid){const r=await pool.query("SELECT COUNT(*)::int count,COALESCE(SUM(amount),0)::bigint total FROM donations WHERE streamer_id=$1 AND status='PAID'",[uid]);const q=await pool.query("SELECT COUNT(*)::int count FROM media WHERE streamer_id=$1 AND status IN ('QUEUED','PLAYING')",[uid]);return {count:r.rows[0].count,total:Number(r.rows[0].total),media:q.rows[0].count}}
function mapDonation(x){return {id:x.id,streamerId:x.streamer_id,donorName:x.donor_name,amount:Number(x.amount),message:x.message,channel:x.channel,mediaUrl:x.media_url,status:x.status,paymentId:x.payment_id,payment:x.payment,paidAt:x.paid_at,createdAt:x.created_at}}
function mapMedia(x){return {id:x.id,donationId:x.donation_id,streamerId:x.streamer_id,url:x.url,title:x.title,amount:Number(x.amount),status:x.status,createdAt:x.created_at,approvedAt:x.approved_at,playedAt:x.played_at}}
