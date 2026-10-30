/* Brigade app — the only address the app talks to. No database key lives in this app. */
window.APP_CONFIG = {
  // R1.18: the function runs next to the database (Oregon, us-west-2) — without this it ran in Ohio and every database
  // question crossed the country (measured 21/10: recipe 3,3–5,0 s → 1,0–1,5 s)
  api: 'https://ydqmumpytgrlceuinoqt.supabase.co/functions/v1/brigade-app-api?forceFunctionRegion=us-west-2',
  build: 'R1.27 + B-86 + B-95'
};
