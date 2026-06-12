# Cloudinary setup

1. Create/sign in to Cloudinary.
2. Copy your Cloud name.
3. Go to Settings > Upload > Upload presets.
4. Create an unsigned upload preset.
5. Suggested preset name: `ms_coaching_materials`.
6. Suggested folder: `ms-coaching/study-materials`.
7. Do not expose Cloudinary API secret in frontend.
8. Paste cloud name and preset into `config.js`.

The app uses this endpoint when `BACKEND_MODE` is true:

`https://api.cloudinary.com/v1_1/YOUR_CLOUD_NAME/auto/upload`
