const fs = require('fs');
const pngToIco = require('png-to-ico');

(async () => {
  try {
    const buf = await pngToIco('C:\\Users\\bruno\\.gemini\\antigravity\\brain\\cd425119-443a-4524-9721-c4459fb2f342\\routster_icon_1775605841876.png');
    if (!fs.existsSync('./assets')) fs.mkdirSync('./assets');
    fs.writeFileSync('./assets/icon.ico', buf);
    console.log('Icon generated at ./assets/icon.ico');
  } catch (err) {
    console.error(err);
  }
})();
