// Configure le projet Expo pour Kairo.IA (nom, icône, couleurs, APK)
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const appJson = path.join(dir, 'app.json');
const cfg = JSON.parse(fs.readFileSync(appJson, 'utf8'));
const e = cfg.expo || (cfg.expo = {});
e.name = 'Kairo.IA';
e.slug = 'kairo-ia';
e.version = '1.0.0';
e.orientation = 'portrait';
e.userInterfaceStyle = 'dark';
e.backgroundColor = '#0D0E1A';
e.icon = './assets/kairo-icon.png';
e.android = e.android || {};
e.android.package = 'com.kendricia.kairoia';
e.android.adaptiveIcon = { foregroundImage: './assets/kairo-adaptive.png', backgroundColor: '#7C5CFF' };
e.android.softwareKeyboardLayoutMode = 'resize';
delete e.android.adaptiveIcon.monochromeImage;
const splash = { image: './assets/kairo-splash.png', resizeMode: 'contain', backgroundColor: '#0D0E1A', imageWidth: 160 };
e.splash = { image: splash.image, resizeMode: 'contain', backgroundColor: splash.backgroundColor };
if (Array.isArray(e.plugins)) {
  e.plugins = e.plugins.map((p) => {
    const nom = Array.isArray(p) ? p[0] : p;
    return nom === 'expo-splash-screen' ? ['expo-splash-screen', splash] : p;
  });
}
fs.writeFileSync(appJson, JSON.stringify(cfg, null, 2) + '\n');
const eas = path.join(dir, 'eas.json');
if (!fs.existsSync(eas)) {
  fs.writeFileSync(eas, JSON.stringify({ build: { preview: { android: { buildType: 'apk' } } } }, null, 2) + '\n');
}
console.log('✅ Kairo.IA configuré : nom, icône, couleurs et eas.json prêts !');
