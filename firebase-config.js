// firebase-config.js — Configuración centralizada de Firebase para Total Tools
window.FBConfig = {
  KEY:          'AIzaSyBkbY-CFtNHfbaG864sXVnaAwBKZGW6SRI',
  PRJ:          'total-tools-24ce8',
  BASE:         'https://firestore.googleapis.com/v1/projects/total-tools-24ce8/databases/(default)/documents',
  STORAGE_BASE: 'https://firebasestorage.googleapis.com/v0/b/total-tools-24ce8.firebasestorage.app/o',

  // Identificador de la app ante Google, para el botón "Entrar con Google".
  // NO es un secreto: viaja en cualquier botón de Google de la web. Sale de
  // Firebase Console → Authentication → Google → ID de cliente web.
  // Mientras esté vacío, el botón no aparece y el ingreso por contraseña
  // funciona igual — así activarlo nunca puede dejar a nadie afuera.
  GOOGLE_CLIENT_ID: '',

  // Identificadores de la app web ante Firebase (App Check los necesita para
  // saber CUÁL app está pidiendo el token). Ninguno es secreto: son los mismos
  // que Firebase muestra en cualquier snippet de inicialización público.
  AUTH_DOMAIN: 'total-tools-24ce8.firebaseapp.com',
  APP_ID:      '1:256086864182:web:fc00c0745400d6737e8397'
};
