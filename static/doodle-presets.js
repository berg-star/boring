"use strict";
(() => {
  // Each model is ordinary editable pen strokes, not an image or a pet save.
  const models = [
    ["blob", "独眼团子", "creature"],
    ["ghost", "歪嘴幽灵", "creature"],
    ["octopus", "触手球", "creature"],
    ["walker", "长脚怪", "creature"],
    ["worm", "弯弯虫", "creature"],
    ["fish", "圆肚鱼", "creature"],
    ["toast", "打工吐司", "object"],
    ["sock", "走丢的袜子", "object"],
    ["cup", "空空杯", "object"],
    ["umbrella", "小雨伞", "object"],
    ["banana", "弯香蕉", "object"],
    ["rocket", "纸皮火箭", "object"],
    ["mushroom", "蘑菇伞", "object"],
    ["cactus", "小仙人掌", "object"],
    ["star", "歪星星", "abstract"],
    ["spring", "没睡醒的弹簧", "abstract"],
    ["yarn", "毛线团", "abstract"],
    ["bolt", "慢吞吞闪电", "abstract"],
    ["cloud", "一朵乱云", "abstract"],
    ["spiral", "蚊香圈", "abstract"],
  ];
  function make(id) {
    if (!models.some((m) => m[0] === id)) throw Error("Unknown doodle");
    const strokes = [],
      colors = ["#28352f", "#638c40", "#dc7050", "#598cae", "#9b70ac"];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const line = (points, width = 9, ink = color) => strokes.push({ color: ink, width, points });
    const oval = (x, y, rx, ry, width = 9) =>
      line(
        Array.from({ length: 49 }, (_, i) => [
          x + Math.cos((i / 48) * Math.PI * 2) * rx,
          y + Math.sin((i / 48) * Math.PI * 2) * ry,
        ]),
        width,
      );
    const face = (x = 320, y = 215, gap = 30) => {
      line([[x - gap, y]], 16, "#28352f");
      line([[x + gap, y]], 16, "#28352f");
      line(
        [
          [x - 17, y + 27],
          [x, y + 34 + Math.random() * 8],
          [x + 20, y + 25],
        ],
        4,
        "#dc7050",
      );
    };
    switch (id) {
      case "blob":
        oval(320, 225, 102, 88);
        oval(320, 211, 32, 32);
        line([[324, 214]], 16);
        line(
          [
            [294, 267],
            [320, 277],
            [344, 265],
          ],
          4,
        );
        break;
      case "ghost":
        line([
          [225, 318],
          [226, 207],
          [241, 156],
          [276, 127],
          [323, 119],
          [370, 138],
          [400, 179],
          [416, 318],
          [380, 294],
          [348, 322],
          [314, 295],
          [280, 320],
          [250, 294],
          [225, 318],
        ]);
        face();
        break;
      case "octopus":
        oval(320, 190, 84, 70);
        for (let i = 0; i < 5; i++)
          line(
            [
              [260 + i * 30, 240],
              [246 + i * 32, 275],
              [258 + i * 33, 320],
              [235 + i * 38, 331],
            ],
            9,
          );
        face(320, 175, 27);
        break;
      case "walker":
        line([
          [239, 245],
          [216, 182],
          [255, 133],
          [323, 155],
          [376, 127],
          [419, 191],
          [390, 247],
          [239, 245],
        ]);
        line([
          [270, 247],
          [251, 313],
          [223, 322],
        ]);
        line([
          [368, 247],
          [387, 313],
          [416, 313],
        ]);
        face(318, 185);
        break;
      case "worm":
        line(
          Array.from({ length: 61 }, (_, i) => [
            198 + i * 4,
            228 + Math.sin((i / 60) * Math.PI * 3) * 44,
          ]),
          16,
        );
        oval(443, 231, 29, 35);
        face(443, 224, 10);
        break;
      case "fish":
        oval(305, 225, 102, 64);
        line([
          [403, 210],
          [466, 168],
          [455, 274],
          [403, 240],
        ]);
        oval(263, 212, 15, 15, 4);
        line([[265, 212]], 9);
        line(
          [
            [226, 243],
            [240, 247],
          ],
          4,
        );
        break;
      case "toast":
        line([
          [231, 302],
          [231, 190],
          [215, 171],
          [220, 140],
          [251, 125],
          [280, 136],
          [310, 119],
          [342, 130],
          [375, 121],
          [406, 139],
          [416, 170],
          [397, 194],
          [397, 302],
          [231, 302],
        ]);
        face(313, 220);
        break;
      case "sock":
        line([
          [290, 119],
          [373, 119],
          [370, 253],
          [404, 276],
          [402, 307],
          [375, 323],
          [235, 323],
          [223, 304],
          [229, 280],
          [285, 246],
          [290, 119],
        ]);
        line(
          [
            [290, 147],
            [372, 147],
          ],
          4,
        );
        face(326, 203, 19);
        break;
      case "cup":
        line([
          [240, 165],
          [385, 165],
          [372, 305],
          [255, 305],
          [240, 165],
        ]);
        line([
          [386, 181],
          [421, 180],
          [443, 209],
          [433, 244],
          [384, 247],
        ]);
        line(
          [
            [280, 135],
            [268, 114],
            [285, 95],
          ],
          4,
        );
        face(315, 217, 26);
        break;
      case "umbrella":
        line([
          [207, 211],
          [226, 164],
          [270, 124],
          [320, 111],
          [367, 130],
          [405, 165],
          [429, 211],
          [385, 196],
          [349, 212],
          [313, 196],
          [277, 213],
          [242, 196],
          [207, 211],
        ]);
        line([
          [320, 111],
          [320, 302],
          [301, 323],
          [280, 319],
          [270, 302],
        ]);
        line(
          [
            [270, 124],
            [253, 196],
          ],
          4,
        );
        line(
          [
            [367, 130],
            [384, 196],
          ],
          4,
        );
        break;
      case "banana":
        line([
          [229, 151],
          [257, 220],
          [319, 263],
          [387, 272],
          [425, 259],
          [390, 302],
          [328, 321],
          [270, 296],
          [230, 253],
          [208, 202],
          [211, 159],
          [229, 151],
        ]);
        line(
          [
            [218, 151],
            [213, 135],
            [230, 131],
            [233, 149],
          ],
          4,
        );
        face(288, 268, 15);
        break;
      case "rocket":
        line([
          [320, 105],
          [352, 141],
          [365, 250],
          [320, 278],
          [275, 250],
          [288, 141],
          [320, 105],
        ]);
        oval(320, 187, 24, 25);
        line([
          [278, 210],
          [249, 257],
          [276, 252],
        ]);
        line([
          [362, 210],
          [390, 257],
          [365, 252],
        ]);
        line(
          [
            [303, 276],
            [303, 313],
            [320, 294],
            [337, 325],
            [339, 273],
          ],
          4,
          "#dc7050",
        );
        break;
      case "mushroom":
        line([
          [205, 223],
          [229, 166],
          [271, 130],
          [320, 116],
          [373, 137],
          [412, 179],
          [435, 223],
          [205, 223],
        ]);
        line([
          [288, 223],
          [278, 313],
          [361, 313],
          [350, 223],
        ]);
        oval(274, 183, 16, 14, 4);
        oval(351, 164, 20, 17, 4);
        face(319, 263, 17);
        break;
      case "cactus":
        line([
          [294, 316],
          [294, 246],
          [247, 246],
          [231, 230],
          [231, 183],
          [252, 183],
          [252, 220],
          [294, 220],
          [294, 141],
          [307, 121],
          [329, 124],
          [342, 145],
          [342, 234],
          [381, 234],
          [381, 200],
          [403, 200],
          [403, 250],
          [385, 261],
          [342, 261],
          [342, 316],
        ]);
        line([
          [276, 317],
          [359, 317],
          [350, 350],
          [285, 350],
          [276, 317],
        ]);
        face(319, 184, 12);
        break;
      case "star": {
        const points = Array.from({ length: 11 }, (_, i) => {
          const a = -Math.PI / 2 + (i * Math.PI) / 5,
            r = i % 2 ? 48 : 112;
          return [320 + Math.cos(a) * r, 225 + Math.sin(a) * r];
        });
        line(points);
        face(320, 213, 22);
        break;
      }
      case "spring":
        line(
          Array.from({ length: 121 }, (_, i) => [
            320 + Math.sin((i / 120) * Math.PI * 10) * 74,
            117 + i * 1.65,
          ]),
          9,
        );
        line([
          [270, 325],
          [365, 325],
        ]);
        break;
      case "yarn":
        for (let j = 0; j < 4; j++)
          line(
            Array.from({ length: 65 }, (_, i) => {
              const a = (i / 64) * Math.PI * 2;
              return [
                320 + Math.cos(a) * Math.cos(j) * 90 - Math.sin(a) * Math.sin(j) * 34,
                225 + Math.cos(a) * Math.sin(j) * 90 + Math.sin(a) * Math.cos(j) * 34,
              ];
            }),
            4,
          );
        line(
          [
            [368, 274],
            [402, 300],
            [433, 286],
            [457, 310],
          ],
          4,
        );
        break;
      case "bolt":
        line([
          [349, 112],
          [242, 239],
          [307, 234],
          [283, 334],
          [399, 190],
          [333, 194],
          [349, 112],
        ]);
        break;
      case "cloud":
        line([
          [242, 283],
          [211, 269],
          [201, 239],
          [209, 213],
          [240, 203],
          [245, 171],
          [266, 146],
          [301, 145],
          [324, 170],
          [351, 150],
          [381, 160],
          [397, 194],
          [429, 204],
          [443, 236],
          [433, 267],
          [404, 283],
          [242, 283],
        ]);
        face(320, 227);
        break;
      case "spiral":
        line(
          Array.from({ length: 161 }, (_, i) => {
            const a = (i / 160) * Math.PI * 7,
              r = 8 + i * 0.58;
            return [320 + Math.cos(a) * r, 225 + Math.sin(a) * r];
          }),
          9,
        );
        break;
    }
    const sx = 0.88 + Math.random() * 0.18,
      sy = 0.9 + Math.random() * 0.16,
      mirror = Math.random() < 0.3 ? -1 : 1;
    for (const s of strokes)
      s.points = s.points.map(([x, y]) => [
        Math.round(320 + (x - 320) * sx * mirror),
        Math.round(220 + (y - 220) * sy),
      ]);
    return strokes;
  }
  window.DoodlePresets = { models, make };
})();
