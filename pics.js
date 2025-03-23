document.addEventListener('DOMContentLoaded', function() {
  const images = [
    'pics/15156894995_e92ee874d9_z.jpg',
    'pics/54387015450_1828774027_k.jpg'
  ];
  const randomImage = images[Math.floor(Math.random() * images.length)];
  document.querySelector('img').src = randomImage;
});