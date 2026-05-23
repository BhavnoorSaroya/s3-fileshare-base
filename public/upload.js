const urlObj = new URL(window.location.href);

// The leading comma skips the empty string before the first '/'
const [, value1, value2] = urlObj.pathname.split('/');

const new_link = `https://s3.bikecamp.ca/${value1}/upload`
const link = document.getElementById("redirect")

link.href = new_link