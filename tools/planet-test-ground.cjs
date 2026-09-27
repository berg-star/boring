module.exports = async function preparePlanet(page) {
  await page.evaluate(() => {
    const key = "boring-lab-planet-v1",
      state = JSON.parse(localStorage.getItem(key));
    Object.assign(state, {
      trees: [],
      ponds: [],
      yaw: -Math.PI / 80,
      pitch: Math.PI * 0.15,
      night: false,
    });
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.locator("#weather-kind").evaluate((el) => (el.value = "rain"));
};
