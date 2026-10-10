import {env} from 'cloudflare:workers';
import {requireChatGPTUser} from '../chatgpt-auth';
import AdminClient from './admin-client';
export const dynamic='force-dynamic';
export default async function Admin(){const user=await requireChatGPTUser('/admin');const emails=String((env as unknown as {ADMIN_EMAILS?:string}).ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase());if(!emails.includes(user.email.toLowerCase()))return <main className="wrap"><h1>沒有後台存取權限</h1><p>請使用協會授權的帳號登入。</p><a href="/signout-with-chatgpt?return_to=%2Fadmin" target="_top">登出並切換帳號</a></main>;return <AdminClient name={user.displayName}/>;}
