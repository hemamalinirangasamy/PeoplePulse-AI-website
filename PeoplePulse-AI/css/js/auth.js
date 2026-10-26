(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const client = window.ppSupabaseClient;
  const emailKey = value => String(value || '').trim().toLowerCase();
  const readLocalUsers = () => {
    try {
      const value = JSON.parse(localStorage.getItem('pp_users') || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  };
  const writeLocalUsers = value => localStorage.setItem('pp_users', JSON.stringify(value));
  const clearLegacyPlaintextPasswords = () => {
    const all = readLocalUsers();
    let changed = false;
    for (const user of all) {
      if (user && typeof user === 'object' && Object.prototype.hasOwnProperty.call(user, 'password')) {
        delete user.password;
        changed = true;
      }
    }
    if (changed) writeLocalUsers(all);
  };
  const saveLocalProfile = profile => {
    const all = readLocalUsers();
    const index = all.findIndex(item => item && emailKey(item.email) === emailKey(profile.email));
    if (index >= 0) all[index] = { ...all[index], ...profile };
    else all.push(profile);
    localStorage.setItem('pp_users', JSON.stringify(all));
  };
  const message = (text, error = false) => {
    const node = $('#formMessage');
    if (!node) return;
    const notice = document.createElement('div');
    notice.className = `notice${error ? ' error' : ''}`;
    notice.setAttribute('role', 'status');
    notice.textContent = text;
    node.replaceChildren(notice);
  };
  function bytesToBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  function base64ToBytes(value) {
    return Uint8Array.from(atob(value), character => character.charCodeAt(0));
  }
  async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16)), iterations = 310000) {
    if (!crypto?.subtle) throw new Error('Secure account migration requires HTTPS or localhost.');
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, 256);
    return `pbkdf2-sha256$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
  }
  async function verifyLocalPassword(password, stored) {
    if (typeof stored !== 'string' || !stored.startsWith('pbkdf2-sha256$')) return false;
    try {
      const [, rounds, salt, expected] = stored.split('$');
      return await hashPassword(password, base64ToBytes(salt), Number(rounds)) === stored && !!expected;
    } catch { return false; }
  }
  function cacheProfile(profile) {
    saveLocalProfile({
      name: profile.full_name || '', email: emailKey(profile.email),
      gender: profile.gender || '', mobile: profile.mobile || ''
    });
  }
  async function getProfile(user) {
    const { data, error } = await client.from('user_profiles')
      .select('user_id,full_name,email,gender,mobile,created_at,last_login_at')
      .eq('user_id', user.id).single();
    if (error) throw new Error(`Could not load your account profile: ${error.message}`);
    return data;
  }
  async function recordLogin(user) {
    const { data, error } = await client.rpc('record_peoplepulse_login');
    if (error) throw new Error(`Could not record login activity: ${error.message}`);
    sessionStorage.setItem('pp_login_event_id', data);
    localStorage.setItem('pp_current_user', emailKey(user.email));
    localStorage.setItem('pp_login_type', 'supabase');
  }
  document.querySelector('.menu-toggle')?.addEventListener('click', () =>
    document.querySelector('.site-header nav')?.classList.toggle('open'));
  clearLegacyPlaintextPasswords();

  $('#registerForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (!client) return message('Supabase is not configured. Check css/js/supabase-config.js.', true);
    const values = new FormData(form);
    const email = emailKey(values.get('email'));
    const password = String(values.get('password') || '');
    const profile = {
      name: String(values.get('name') || '').trim(),
      gender: String(values.get('gender') || ''),
      mobile: String(values.get('mobile') || '').trim()
    };
    if (password !== String(values.get('confirm') || '')) return message('Your passwords do not match.', true);
    if (readLocalUsers().some(user => user && emailKey(user.email) === email && user.passwordHash)) {
      return message('That email is already registered. Try logging in.', true);
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const { data, error } = await client.auth.signUp({
        email, password, options: { data: { ...profile } }
      });
      if (error) throw error;
      if (!data.session) {
        throw new Error('Disable email confirmation in Supabase Authentication settings to keep password-only registration. The account may already have been created; try logging in after changing that setting.');
      }
      const authProfile = await getProfile(data.user);
      cacheProfile(authProfile);
      localStorage.setItem('pp_pending_user', email);
      await client.auth.signOut();
      location.href = 'login.html?registered=1';
    } catch (error) {
      message(error?.message || 'Account creation failed. Please try again.', true);
      button.disabled = false;
    }
  });

  $('#loginForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (!client) return message('Supabase is not configured. Check css/js/supabase-config.js.', true);
    const email = emailKey($('#email').value);
    const password = $('#password').value;
    const button = form.querySelector('[type="submit"]');
    const legacyUser = readLocalUsers().find(user => user && emailKey(user.email) === email) || null;
    button.disabled = true;
    try {
      let { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        const oldUser = legacyUser;
        const canMigrate = oldUser && await verifyLocalPassword(password, oldUser.passwordHash);
        if (!canMigrate) throw new Error('Invalid email or password.');
        const legacyProfile = { name: oldUser.name || '', gender: oldUser.gender || '', mobile: oldUser.mobile || '' };
        const migration = await client.auth.signUp({ email, password, options: { data: legacyProfile } });
        if (migration.error) {
          const retry = await client.auth.signInWithPassword({ email, password });
          if (retry.error) throw new Error(migration.error.message);
          data = retry.data;
        } else {
          data = migration.data;
          if (!data.session) throw new Error('Disable email confirmation in Supabase Authentication settings to migrate this account without verification email.');
        }
      }
      if (!data.session || !data.user) throw new Error('Could not start a signed-in session. Check Supabase email/password settings.');
      const profile = await getProfile(data.user);
      cacheProfile(profile);
      await recordLogin(data.user);
      const pendingCategory = localStorage.getItem('pp_pending_category') || '';
      if (/^(water|roads|waste|drainage|electricity|healthcare|employment|education)$/.test(pendingCategory)) {
        localStorage.removeItem('pp_pending_category');
        location.href = `survey.html?category=${encodeURIComponent(pendingCategory)}`;
      } else location.href = 'survey.html';
    } catch (error) {
      await client.auth.signOut().catch(() => {});
      message(error?.message || 'Invalid email or password.', true);
      button.disabled = false;
    }
  });

  const query = new URLSearchParams(location.search);
  if (query.get('registered') === '1') message('Account created successfully. Log in to continue.');
})();
