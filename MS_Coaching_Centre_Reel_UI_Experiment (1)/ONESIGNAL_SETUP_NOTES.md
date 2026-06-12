# OneSignal Push Notification Setup Notes

This ZIP includes basic OneSignal Web Push setup for the M.S Coaching Centre PWA.

Added:
- OneSignal Web SDK in index.html
- OneSignalSDKWorker.js and OneSignalSDKUpdaterWorker.js in root
- ONESIGNAL_APP_ID in config.js
- Enable Notifications button in Profile
- OneSignal user tagging after login where supported
- Service worker cache version updated

Current App ID:
9e27d051-a6aa-49ba-84b0-be4608ed9721

Important:
- This enables device subscription and test/welcome notifications from OneSignal.
- Automatic notifications when admin adds notice / attendance / fees need a backend sender, such as Supabase Edge Function + OneSignal REST API key.
- Do not paste the OneSignal REST API key into frontend app.js/config.js.
