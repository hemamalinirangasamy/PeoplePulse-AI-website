(() => {
  'use strict';
  const client = window.ppSupabaseClient;
  const cachedEmail = String(localStorage.getItem('pp_current_user') || '').toLowerCase();
  const loginType = localStorage.getItem('pp_login_type');
  const redirectToLogin = () => location.replace('login.html');
  if (!client || loginType !== 'supabase' || !cachedEmail) {
    redirectToLogin();
    return;
  }
  client.auth.getUser().then(({ data, error }) => {
    const authEmail = String(data.user?.email || '').toLowerCase();
    let profiles = [];
    try { profiles = JSON.parse(localStorage.getItem('pp_users') || '[]'); } catch {}
    if (error || !data.user || authEmail !== cachedEmail ||
        !Array.isArray(profiles) || !profiles.some(profile => String(profile.email || '').toLowerCase() === authEmail)) {
      redirectToLogin();
    }
  }).catch(redirectToLogin);

  document.querySelector('#logoutLink')?.addEventListener('click', async event => {
    event.preventDefault();
    const eventId = sessionStorage.getItem('pp_login_event_id');
    if (eventId) await client.rpc('record_peoplepulse_logout', { event_id: eventId }).catch(() => {});
    await client.auth.signOut();
    sessionStorage.removeItem('pp_login_event_id');
    localStorage.removeItem('pp_current_user');
    localStorage.removeItem('pp_login_type');
    location.href = 'login.html';
  });
})();
