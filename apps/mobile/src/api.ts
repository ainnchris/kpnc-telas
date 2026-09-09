export const WEBSITE = 'https://kpnc-meet.pages.dev';
const API = 'https://kpnc-meet-api.erikchristian2.workers.dev';
export interface Profile {name:string; avatar:string}
export interface Auth {token:string;url:string;room:string;host:boolean;hostKey?:string}
export interface JoinRequest {requestId:string;requestSecret:string;room:string}
export interface Pending {id:string;name:string;avatar?:string}
export class ApiError extends Error {constructor(message:string,public status:number){super(message)}}
export async function api<T>(path:string, options:RequestInit={}):Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(),15000);
  const abort = ()=>controller.abort();
  options.signal?.addEventListener('abort',abort);
  if(options.signal?.aborted)controller.abort();
  try {
    const response = await fetch(API+path,{...options,signal:controller.signal,headers:{'Content-Type':'application/json',...options.headers}});
    const data = await response.json();
    if(!response.ok)throw new ApiError(data.error || 'Não foi possível concluir esta ação.',response.status);
    return data as T;
  } finally {clearTimeout(timeout);options.signal?.removeEventListener('abort',abort)}
}
export function roomCode(value:string):string {
  const input=value.trim();
  try {
    const url=new URL(input);
    if(url.protocol==='kpncmeet:' && url.hostname==='join')return validCode(url.pathname.slice(1));
    if(url.origin===WEBSITE)return validCode(url.searchParams.get('room')||'');
    return '';
  } catch {return validCode(input)}
}
function validCode(value:string){return /^[a-z0-9-]{6,64}$/i.test(value)?value.toLowerCase():''}
export const post = (body?:unknown, hostKey?:string):RequestInit => ({method:'POST',body:JSON.stringify(body||{}),headers:hostKey?{Authorization:`Bearer ${hostKey}`}:{}});
