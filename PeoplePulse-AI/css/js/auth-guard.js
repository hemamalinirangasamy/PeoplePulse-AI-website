(()=>{'use strict';
const email=localStorage.getItem('pp_current_user'),type=localStorage.getItem('pp_login_type');
let profiles=[];try{profiles=JSON.parse(localStorage.getItem('pp_users')||'[]')}catch{}
if(!email||type!=='local'||!Array.isArray(profiles)||!profiles.some(user=>String(user.email||'').toLowerCase()===email.toLowerCase())){
  location.replace('login.html');return;
}
document.querySelector('#logoutLink')?.addEventListener('click',()=>{
  localStorage.removeItem('pp_current_user');localStorage.removeItem('pp_login_type');
});
})();
