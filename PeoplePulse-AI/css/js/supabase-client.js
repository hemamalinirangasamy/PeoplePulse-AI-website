(() => {
  const config = window.PP_SUPABASE_CONFIG;
  const ready = config?.url && config?.anonKey &&
    !config.url.includes('YOUR_PROJECT_REF') &&
    !config.anonKey.includes('YOUR_SUPABASE_');
  if (!ready || !window.supabase?.createClient) return;
  window.ppSupabaseClient = window.supabase.createClient(config.url, config.anonKey);
})();
