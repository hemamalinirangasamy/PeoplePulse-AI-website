(()=>{'use strict';
const $=s=>document.querySelector(s);
const message=(text,error=false)=>{const node=$('#formMessage');if(node)node.innerHTML=`<div class="notice ${error?'error':''}" role="status">${text}</div>`};
const users=()=>{try{const value=JSON.parse(localStorage.getItem('pp_users')||'[]');return Array.isArray(value)?value:[]}catch{return []}};
const saveUsers=value=>localStorage.setItem('pp_users',JSON.stringify(value));
const emailKey=value=>String(value||'').trim().toLowerCase();
function bytesToBase64(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary)}
function base64ToBytes(value){return Uint8Array.from(atob(value),char=>char.charCodeAt(0))}
async function hashPassword(password,salt=crypto.getRandomValues(new Uint8Array(16)),iterations=310000){
  if(!crypto?.subtle)throw new Error('Secure password storage requires HTTPS or localhost.');
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,256);
  return `pbkdf2-sha256$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}
async function verifyPassword(password,stored){
  if(typeof stored!=='string'||!stored.startsWith('pbkdf2-sha256$'))return false;
  try{const [,iterationText,saltText,expected]=stored.split('$'),iterations=Number(iterationText);if(!iterations||!expected)return false;return await hashPassword(password,base64ToBytes(saltText),iterations)===stored}catch{return false}
}
document.querySelector('.menu-toggle')?.addEventListener('click',()=>document.querySelector('.site-header nav')?.classList.toggle('open'));

$('#registerForm')?.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;
  const values=new FormData(form),email=emailKey(values.get('email')),password=String(values.get('password')||'');
  if(password!==String(values.get('confirm')||'')){message('Your passwords do not match.',true);return}
  const all=users();if(all.some(user=>emailKey(user.email)===email)){message('That email is already registered. Try logging in.',true);return}
  const button=form.querySelector('[type="submit"]');button.disabled=true;
  try{
    const passwordHash=await hashPassword(password);
    all.push({name:String(values.get('name')||'').trim(),email,gender:String(values.get('gender')||''),mobile:String(values.get('mobile')||'').trim(),passwordHash});
    saveUsers(all);localStorage.setItem('pp_pending_user',email);location.href='login.html?registered=1';
  }catch(error){message(error?.message||'Account creation failed. Please try again.',true);button.disabled=false}
});

$('#loginForm')?.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;
  const email=emailKey($('#email').value),password=$('#password').value,all=users(),index=all.findIndex(user=>emailKey(user.email)===email),button=form.querySelector('[type="submit"]');button.disabled=true;
  try{
    const user=index>=0?all[index]:null;
    let valid=!!user&&await verifyPassword(password,user.passwordHash);
    if(!valid&&user&&typeof user.password==='string'&&user.password===password){user.passwordHash=await hashPassword(password);delete user.password;all[index]=user;saveUsers(all);valid=true}
    if(!valid)throw new Error('Invalid email or password.');
    localStorage.setItem('pp_current_user',email);localStorage.setItem('pp_login_type','local');
    location.href='survey.html';
  }catch{message('Invalid email or password.',true);button.disabled=false}
});

const query=new URLSearchParams(location.search);if(query.get('registered')==='1')message('Account created successfully. Log in to continue.');
})();
