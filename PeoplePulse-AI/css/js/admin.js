(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const client = window.ppSupabaseClient;
  const loginForm = $('#adminLoginForm');
  const roleFor = async userId => {
    const { data, error } = await client.from('user_roles')
      .select('role').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data?.role;
  };

  if (loginForm) {
    const setupMessage = new URLSearchParams(location.search).get('setup');
    const loginMessage = loginForm.querySelector('#adminFormMessage, #formMessage');
    if (setupMessage && loginMessage) loginMessage.innerHTML = `<div class="notice error">${esc(setupMessage)}</div>`;
    loginForm.addEventListener('submit', async event => {
      event.preventDefault();
      const button = loginForm.querySelector('[type="submit"]');
      const message = loginMessage;
      if (!client) {
        message.innerHTML = '<div class="notice error">Supabase is not configured. Follow SETUP_SUPABASE_ADMIN.md.</div>';
        return;
      }
      button.disabled = true;
      message.textContent = '';
      try {
        const { data, error } = await client.auth.signInWithPassword({
          email: loginForm.querySelector('#adminEmail, #email').value.trim(),
          password: loginForm.querySelector('#adminPassword, #password').value
        });
        if (error) throw error;
        if (!data.user || await roleFor(data.user.id) !== 'admin') {
          await client.auth.signOut();
          throw new Error('This account is not authorized as an admin.');
        }
        const { data: eventId, error: activityError } = await client.rpc('record_peoplepulse_login');
        if (activityError) {
          const missingFunction = activityError.code === 'PGRST202' || /schema cache|function .*record_peoplepulse_login/i.test(activityError.message || '');
          if (missingFunction) {
            throw new Error('Admin credentials are valid, but the database setup is incomplete. Run the latest supabase-admin-setup.sql in the Supabase SQL Editor, then try again.');
          }
          throw new Error(`Could not record admin login activity: ${activityError.message}`);
        }
        sessionStorage.setItem('pp_login_event_id', eventId);
        location.href = 'admin-dashboard.html';
      } catch (error) {
        await client.auth.signOut().catch(() => {});
        message.innerHTML = `<div class="notice error">${esc(error.message || 'Admin sign in failed.')}</div>`;
        button.disabled = false;
      }
    });
    return;
  }

  const table = $('#submissionRows');
  if (!table) return;
  const layout = $('.admin-layout');
  const status = document.createElement('div');
  status.className = 'notice';
  status.id = 'dashboardMessage';
  status.hidden = true;
  $('.dash-top')?.after(status);
  if (layout) layout.style.visibility = 'hidden';
  let all = [];
  let allUsers = [];
  let allActivity = [];
  let adminIds = new Set();

  async function requireAdmin() {
    if (!client) throw new Error('Supabase is not configured. Follow SETUP_SUPABASE_ADMIN.md.');
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const user = data.session?.user;
    if (!user || await roleFor(user.id) !== 'admin') {
      await client.auth.signOut();
      location.replace('admin-login.html');
      return false;
    }
    adminIds.add(user.id);
    return true;
  }

  function showStatus(message, isError = false) {
    status.hidden = !message;
    status.textContent = message || '';
    status.classList.toggle('error', isError);
  }

  function fillFilter(element, values, label) {
    const previous = element.value;
    element.innerHTML = `<option value="">All ${label}</option>` +
      [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)))
        .map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    element.value = previous;
  }

  function chart(selector, values, label) {
    const root = $(selector);
    const pairs = Object.entries(values).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = Math.max(1, ...pairs.map(pair => pair[1]));
    root.innerHTML = pairs.length ? pairs.map(([name, count]) =>
      `<div class="bar-row"><span title="${esc(name)}">${esc(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, count / max * 100)}%"></div></div><b>${count}</b></div>`
    ).join('') : `<div class="empty">No ${label} data yet.</div>`;
  }

  function render() {
    const category = $('#filterCategory').value;
    const district = $('#filterDistrict').value;
    const area = $('#filterArea').value;
    const date = $('#filterDate').value;
    const nameQuery = $('#searchName').value.trim().toLowerCase();
    const emailQuery = $('#searchEmail').value.trim().toLowerCase();
    const rows = all.filter(submission =>
      (!category || submission.category === category) &&
      (!district || submission.location?.district === district) &&
      (!area || submission.location?.area === area) &&
      (!date || String(submission.submittedAt || '').slice(0, 10) === date) &&
      (!nameQuery || String(submission.user?.name || '').toLowerCase().includes(nameQuery)) &&
      (!emailQuery || String(submission.user?.email || '').toLowerCase().includes(emailQuery))
    ).sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
    $('#resultCount').textContent = `${rows.length} response${rows.length === 1 ? '' : 's'}`;
    table.innerHTML = rows.map(submission => `<tr>
      <td>${esc(submission.id || '—')}</td><td>${esc(submission.user?.name || '—')}</td>
      <td>${esc(submission.category || '—')}</td><td>${esc(submission.location?.district || '—')}</td>
      <td>${esc(submission.location?.area || '—')}</td><td>${esc(submission.location?.street || '—')}</td>
      <td>${submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : '—'}</td>
      <td><button class="table-action" data-view="${esc(submission.id)}" type="button">View details</button></td>
    </tr>`).join('');
    $('#emptyState').textContent = all.length ? 'No submissions match these filters.' : 'No survey responses yet.';
    $('#emptyState').classList.toggle('hidden', rows.length > 0);
  }

  function renderUsers() {
    const name = $('#searchUsersName').value.trim().toLowerCase();
    const email = $('#searchUsersEmail').value.trim().toLowerCase();
    const createdOn = $('#filterUserDate').value;
    const rows = allUsers.filter(user =>
      (!name || String(user.full_name || '').toLowerCase().includes(name)) &&
      (!email || String(user.email || '').toLowerCase().includes(email)) &&
      (!createdOn || String(user.created_at || '').slice(0, 10) === createdOn)
    );
    $('#userResultCount').textContent = `${rows.length} user${rows.length === 1 ? '' : 's'}`;
    $('#registeredUserRows').innerHTML = rows.map(user => `<tr>
      <td>${esc(user.full_name || '—')}</td><td>${esc(user.email || '—')}</td>
      <td>${user.created_at ? new Date(user.created_at).toLocaleString() : '—'}</td>
      <td>${user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'No login recorded'}</td>
    </tr>`).join('');
    $('#emptyUsers').classList.toggle('hidden', rows.length > 0);
  }

  function renderActivity() {
    const query = $('#searchActivity').value.trim().toLowerCase();
    const profiles = new Map(allUsers.map(user => [user.user_id, user]));
    const rows = allActivity.filter(activity => {
      const user = profiles.get(activity.user_id);
      return user && (!query || `${user.full_name || ''} ${user.email || ''}`.toLowerCase().includes(query));
    });
    $('#loginActivityRows').innerHTML = rows.map(activity => {
      const user = profiles.get(activity.user_id);
      return `<tr><td>${esc(user?.full_name || '—')}</td><td>${esc(user?.email || '—')}</td>
        <td>${activity.logged_in_at ? new Date(activity.logged_in_at).toLocaleString() : '—'}</td>
        <td>${activity.logged_out_at ? new Date(activity.logged_out_at).toLocaleString() : 'Session active / logout not recorded'}</td></tr>`;
    }).join('');
    $('#emptyActivity').classList.toggle('hidden', rows.length > 0);
  }

  async function fetchAllRows(tableName, columns, orderBy) {
    const records = [];
    let offset = 0;
    while (true) {
      const { data, error } = await client.from(tableName).select(columns)
        .order(orderBy, { ascending: false }).range(offset, offset + 999);
      if (error) throw error;
      records.push(...(data || []));
      if (!data || data.length < 1000) return records;
      offset += data.length;
    }
  }

  function showDetails(id) {
    const submission = all.find(item => String(item.id) === String(id));
    if (!submission) return;
    const user = submission.user || {};
    const place = submission.location || {};
    const answers = Object.entries(submission.answers || {}).map(([question, answer]) =>
      `<div class="review-row"><span>${esc(question)}</span><b>${esc(answer)}</b></div>`
    ).join('') || '<p>No stored answers were found in this record.</p>';
    const photo = /^data:image\//i.test(submission.photoDataUrl || '')
      ? `<img class="response-photo" src="${esc(submission.photoDataUrl)}" alt="Uploaded survey photo">`
      : submission.photoName ? `Photo filename: <b>${esc(submission.photoName)}</b>` : 'No photo uploaded';
    $('#modalRoot').innerHTML = `<div class="modal-backdrop" role="presentation"><article class="modal" role="dialog" aria-modal="true" aria-labelledby="detailTitle">
      <button class="modal-close" aria-label="Close">×</button><h2 id="detailTitle">Complete response · ${esc(submission.id || '')}</h2><div class="modal-body">
      <div class="review-group"><h3>Submission</h3><div class="review-row"><span>Submission ID</span><b>${esc(submission.id || '—')}</b></div><div class="review-row"><span>Date and time</span><b>${submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : '—'}</b></div></div>
      <div class="review-group"><h3>Participant</h3>${[['Full name', user.name], ['Email', user.email], ['Mobile', user.mobile], ['Gender', user.gender]].map(([label, value]) => `<div class="review-row"><span>${label}</span><b>${esc(value || '—')}</b></div>`).join('')}</div>
      <div class="review-group"><h3>Problem location</h3>${[['State', place.state], ['District', place.district], ['Area', place.area], ['Street', place.street], ['Pincode', place.pincode]].map(([label, value]) => `<div class="review-row"><span>${label}</span><b>${esc(value || '—')}</b></div>`).join('')}</div>
      <div class="review-group"><h3>Problem details</h3>${[['Category', submission.category], ['Description', submission.description], ['Additional Suggestions', submission.suggestions], ['Duration', submission.duration]].map(([label, value]) => `<div class="review-row"><span>${label}</span><b>${esc(value || '—')}</b></div>`).join('')}<div class="review-row"><span>Uploaded photo</span><b>${photo}</b></div></div>
      <div class="review-group"><h3>${esc(submission.category || 'Category')} · ${Object.keys(submission.answers || {}).length} answers</h3>${answers}</div>
      <button class="button danger-button" id="deleteThis" type="button">Delete this response</button></div></article></div>`;
    $('#modalRoot .modal-close').addEventListener('click', () => $('#modalRoot').innerHTML = '');
    $('#modalRoot .modal-backdrop').addEventListener('click', event => {
      if (event.target.classList.contains('modal-backdrop')) $('#modalRoot').innerHTML = '';
    });
    $('#deleteThis').addEventListener('click', () => removeOne(submission.id));
  }

  async function fetchRows() {
    showStatus('Loading submissions…');
    const records = [];
    let offset = 0;
    while (true) {
      const { data, error } = await client.from('survey_submissions')
        .select('submission_id,data,created_at')
        .order('created_at', { ascending: false }).order('submission_id', { ascending: false })
        .range(offset, offset + 999);
      if (error) throw error;
      records.push(...(data || []));
      if (!data || data.length < 1000) break;
      offset += data.length;
    }
    all = records.map(row => ({ ...row.data, id: row.submission_id, submittedAt: row.data?.submittedAt || row.created_at }));
    const [profiles, activity, roles] = await Promise.all([
      fetchAllRows('user_profiles', 'user_id,full_name,email,gender,mobile,created_at,last_login_at', 'created_at'),
      fetchAllRows('user_login_activity', 'id,user_id,logged_in_at,logged_out_at', 'logged_in_at'),
      client.from('user_roles').select('user_id').eq('role', 'admin').then(({ data, error }) => {
        if (error) throw error;
        return data || [];
      })
    ]);
    adminIds = new Set(roles.map(role => role.user_id));
    allUsers = profiles.filter(user => !adminIds.has(user.user_id));
    allActivity = activity.filter(entry => !adminIds.has(entry.user_id));
    const today = new Date().toLocaleDateString();
    $('#totalCount').textContent = all.length;
    $('#todayCount').textContent = all.filter(item => new Date(item.submittedAt).toLocaleDateString() === today).length;
    $('#todayDate').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    $('#categoryCount').textContent = new Set(all.map(item => item.category).filter(Boolean)).size;
    $('#userCount').textContent = allUsers.length;
    const categories = [['💧', 'Water & Drinking Water'], ['🛣️', 'Roads & Transport'], ['🗑️', 'Garbage & Waste Management'], ['🚰', 'Drainage & Sewage'], ['⚡', 'Electricity & Power'], ['🏥', 'Healthcare'], ['💼', 'Employment'], ['🎓', 'Education']];
    const categoryCount = all.reduce((counts, item) => (counts[item.category] = (counts[item.category] || 0) + 1, counts), {});
    $('#categoryTotals').innerHTML = categories.map(([icon, name]) => `<article class="category-total"><span>${icon} ${esc(name)}</span><strong>${categoryCount[name] || 0}</strong></article>`).join('');
    const countBy = items => items.reduce((counts, value) => (counts[value || 'Unknown'] = (counts[value || 'Unknown'] || 0) + 1, counts), {});
    chart('#categoryChart', countBy(all.map(item => item.category)), 'category');
    chart('#districtChart', countBy(all.map(item => item.location?.district)), 'district');
    chart('#areaChart', countBy(all.map(item => item.location?.area)), 'area');
    fillFilter($('#filterCategory'), all.map(item => item.category), 'categories');
    fillFilter($('#filterDistrict'), all.map(item => item.location?.district), 'districts');
    fillFilter($('#filterArea'), all.map(item => item.location?.area), 'areas');
    render();
    renderUsers();
    renderActivity();
    showStatus('');
  }

  async function removeOne(id) {
    if (!confirm(`Delete response ${id}?`)) return;
    const { error } = await client.from('survey_submissions').delete().eq('submission_id', id);
    if (error) return showStatus(`Could not delete response: ${error.message}`, true);
    $('#modalRoot').innerHTML = '';
    await fetchRows();
  }

  function csvCell(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
  function exportCsv() {
    const base = ['Submission ID', 'Submission Date & Time', 'Full Name', 'Email', 'Mobile Number', 'Gender', 'State', 'District', 'Area', 'Street', 'Pincode', 'Selected Category', 'Problem Description', 'Additional Suggestions', 'Problem Duration', 'Uploaded Photo'];
    const questions = [...new Set(all.flatMap(item => Object.keys(item.answers || {})))];
    const headers = [...base, ...questions];
    const lines = all.map(item => {
      const user = item.user || {}, place = item.location || {};
      const fields = [item.id, item.submittedAt, user.name, user.email, user.mobile, user.gender, place.state, place.district, place.area, place.street, place.pincode, item.category, item.description, item.suggestions, item.duration, item.photoName];
      return [...fields, ...questions.map(question => item.answers?.[question] || '')].map(csvCell).join(',');
    });
    const blob = new Blob(['\ufeff' + [headers.map(csvCell).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'peoplepulse-responses.csv'; link.click(); URL.revokeObjectURL(url);
  }

  async function start() {
    try {
      if (!await requireAdmin()) return;
      layout.style.visibility = 'visible';
      $('#adminLogout').addEventListener('click', async event => {
        event.preventDefault();
        const eventId = sessionStorage.getItem('pp_login_event_id');
        if (eventId) await client.rpc('record_peoplepulse_logout', { event_id: eventId }).catch(() => {});
        sessionStorage.removeItem('pp_login_event_id');
        await client.auth.signOut(); location.href = 'admin-login.html';
      });
      ['filterCategory', 'filterDistrict', 'filterArea'].forEach(id => $('#' + id).addEventListener('change', render));
      $('#filterDate').addEventListener('change', render);
      $('#searchName').addEventListener('input', render);
      $('#searchEmail').addEventListener('input', render);
      $('#searchUsersName').addEventListener('input', renderUsers);
      $('#searchUsersEmail').addEventListener('input', renderUsers);
      $('#filterUserDate').addEventListener('change', renderUsers);
      $('#searchActivity').addEventListener('input', renderActivity);
      $('#refreshResponses').addEventListener('click', () => fetchRows().catch(error => showStatus(error.message, true)));
      $('#exportResponses').addEventListener('click', exportCsv);
      $('#clearResponses').addEventListener('click', async () => {
        if (!all.length || !confirm(`Permanently clear all ${all.length} Supabase responses?`)) return;
        const { error } = await client.from('survey_submissions').delete().neq('submission_id', '');
        if (error) return showStatus(`Could not clear responses: ${error.message}`, true);
        $('#modalRoot').innerHTML = '';
        await fetchRows();
      });
      table.addEventListener('click', event => {
        const button = event.target.closest('[data-view]');
        if (button) showDetails(button.dataset.view);
      });
      await fetchRows();
    } catch (error) {
      location.replace(`admin-login.html?setup=${encodeURIComponent(error.message || 'Could not verify admin access.')}`);
    }
  }
  start();
})();
