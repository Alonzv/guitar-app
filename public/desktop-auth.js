// The Mac app sends Google/Apple sign-in to the system browser; Supabase
// returns here with the session in the URL. Hand it back to the app through
// its scaleup:// link (the button repeats it if the browser asked first).
(function () {
  var link = 'scaleup://auth' + (location.search || '') + (location.hash || '');
  document.getElementById('open').setAttribute('href', link);
  if (/error/.test(location.search + location.hash)) {
    document.getElementById('msg').textContent = 'Sign-in did not finish. Return to ScaleUp and try again.';
  }
  location.replace(link);
})();
