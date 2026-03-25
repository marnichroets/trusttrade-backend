const handleLogin = () => {
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(window.location.origin)}`;
};