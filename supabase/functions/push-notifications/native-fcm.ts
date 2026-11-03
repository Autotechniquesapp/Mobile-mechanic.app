// Server only. Never expose FIREBASE_SERVICE_ACCOUNT_JSON in a browser or APK.
// Uses the FCM HTTP v1 API, preserving existing VAPID/Web Push for web clients.
const CHANNEL_ID='new_customer_jobs_v1';
let access:{token:string;expires:number}|null=null;

type ServiceAccount={project_id:string;client_email:string;private_key:string};
// Some mobile text viewers copy the PEM with literal line breaks inside its
// JSON string. Repair only that exact field and PEM envelope; other malformed
// JSON still fails closed. Correctly encoded JSON is used without changes.
function parseServiceAccount(value:string){
  try{return JSON.parse(value);}catch{
    const repaired=value.replace(/("private_key"\s*:\s*")(-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----[\r\n]*)(")/,
      (_match,prefix,pem,suffix)=>prefix+pem.replace(/\r/g,'\\r').replace(/\n/g,'\\n')+suffix);
    return JSON.parse(repaired);
  }
}
export function nativePushConfigurationStatus(){
  const value=Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if(!value?.trim())return 'missing';
  let key;
  try{key=parseServiceAccount(value);}catch(error){
    // Return only fixed categories. JSON parser messages can contain snippets
    // of credentials, so never return or log the original message.
    const message=error instanceof Error?error.message:'';
    if(value.charCodeAt(0)===0xfeff)return 'invalid_json_bom';
    if(value.trimStart().startsWith('```'))return 'invalid_json_code_fence';
    if(/Bad control character/i.test(message))return 'invalid_json_unescaped_line_break';
    if(/Expected property name|Expected double-quoted property/i.test(message))return 'invalid_json_property_quotes';
    if(/Unexpected end|Unterminated/i.test(message))return 'invalid_json_incomplete';
    if(/after JSON/i.test(message))return 'invalid_json_extra_content';
    return 'invalid_json';
  }
  if(key?.project_info||key?.client)return 'android_client_file';
  if(typeof key==='string')return 'quoted_json';
  if(!key||!['project_id','client_email','private_key'].every(field=>typeof key[field]==='string'&&key[field].trim()))return 'missing_service_account_fields';
  return 'configured';
}
function config():ServiceAccount|null{
  try{
    const json=Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
    if(!json)return null;
    const key=parseServiceAccount(json);
    if(!key.project_id||!key.client_email||!key.private_key)return null;
    return key;
  }catch{return null;}
}
function b64url(input:Uint8Array){
  let chars='';for(const n of input)chars+=String.fromCharCode(n);
  return btoa(chars).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function bytes(value:string){return new TextEncoder().encode(value);}
async function bearer(key:ServiceAccount){
  if(access&&access.expires>Date.now()+60000)return access.token;
  const now=Math.floor(Date.now()/1000);
  const header=b64url(bytes(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const claims=b64url(bytes(JSON.stringify({
    iss:key.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',
    aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600
  })));
  const unsigned=header+'.'+claims;
  const stripped=key.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const decoded=Uint8Array.from(atob(stripped),c=>c.charCodeAt(0));
  const privateKey=await crypto.subtle.importKey('pkcs8',decoded,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,bytes(unsigned)));
  const assertion=unsigned+'.'+b64url(signature);
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})
  });
  if(!response.ok)throw new Error('Firebase token authorization failed ('+response.status+')');
  const data=await response.json();
  if(!data.access_token)throw new Error('Firebase token response was empty');
  access={token:data.access_token,expires:Date.now()+Math.max(60,Number(data.expires_in||3600))*1000};
  return access.token;
}
export function nativePushConfigured(){return Boolean(config());}
export async function sendNativeIntakePush(args:{
  tokens:string[];intakeId:string;customer:string;vehicle:string;pendingCount:number
}):Promise<{sent:number;invalid:string[]}>{
  const key=config();
  if(!key||!args.tokens.length)return {sent:0,invalid:[]};
  const authorization=await bearer(key);
  const invalid:string[]=[];
  let sent=0;
  for(const token of args.tokens){
    try{
      const result=await fetch('https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(key.project_id)+'/messages:send',{
        method:'POST',
        headers:{Authorization:'Bearer '+authorization,'Content-Type':'application/json'},
        body:JSON.stringify({message:{
          token,
          notification:{title:'New Customer Job',body:['New customer'+(args.customer?': '+args.customer:''),args.vehicle].filter(Boolean).join(' — ')},
          android:{
            priority:'HIGH',ttl:'300s',restricted_package_name:'app.mobilemechanic.ai',
            notification:{
              channel_id:CHANNEL_ID,
              tag:'intake-'+args.intakeId,
              notification_count:Math.max(1,args.pendingCount),
              default_sound:true
            }
          },
          data:{type:'new_intake',intake_id:args.intakeId,url:'https://mobile-mechanic.app/#dashboard'}
        }})
      });
      if(result.ok){sent++;continue;}
      const failure=await result.json().catch(()=>({})),code=result.status;
      // FCM permanently invalid/expired token. A transient failure must not
      // unregister a healthy device.
      if(failure.error?.details?.some((d:{errorCode?:string})=>d.errorCode==='UNREGISTERED'))invalid.push(token);
      else console.error('Native FCM send failed',code,failure.error?.status||'unknown');
    }catch(err){console.error('Native FCM send request failed',err);}
  }
  return {sent,invalid};
}
