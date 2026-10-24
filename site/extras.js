/* Heresay site extras: loader, live logo face, topbar theme, cursor, setup toy, feature hovers, crowd closer, sound.
   Everything here is progressive: without JS (or with reduced motion) the page is complete and still. */
(function () {
  'use strict';
  var d = document, de = d.documentElement;
  var q = function (s, r) { return (r || d).querySelector(s); };
  var qa = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var BLOB = 'M174.00 100.00 L174.47 100.65 L174.93 101.31 L175.38 101.97 L175.82 102.65 L176.26 103.33 L176.68 104.02 L177.08 104.71 L177.47 105.42 L177.85 106.13 L178.20 106.84 L178.54 107.56 L178.86 108.29 L179.15 109.02 L179.43 109.75 L179.68 110.49 L179.90 111.23 L180.10 111.97 L180.28 112.72 L180.43 113.46 L180.55 114.20 L180.65 114.95 L180.71 115.69 L180.75 116.43 L180.76 117.17 L180.73 117.90 L180.68 118.63 L180.60 119.35 L180.49 120.07 L180.34 120.78 L180.17 121.48 L179.97 122.18 L179.74 122.86 L179.48 123.54 L179.19 124.21 L178.87 124.87 L178.52 125.51 L178.14 126.15 L177.74 126.77 L177.31 127.38 L176.86 127.98 L176.38 128.56 L175.88 129.13 L175.36 129.68 L174.81 130.23 L174.25 130.75 L173.66 131.27 L173.06 131.77 L172.44 132.25 L171.80 132.72 L171.15 133.18 L170.48 133.62 L169.80 134.04 L169.11 134.46 L168.41 134.86 L167.70 135.24 L166.99 135.62 L166.27 135.98 L165.54 136.33 L164.82 136.67 L164.09 137.00 L163.35 137.32 L162.62 137.63 L161.89 137.93 L161.17 138.22 L160.45 138.51 L159.73 138.79 L159.02 139.06 L158.31 139.33 L157.62 139.60 L156.93 139.86 L156.25 140.13 L155.59 140.39 L154.93 140.65 L154.29 140.91 L153.66 141.17 L153.04 141.44 L152.44 141.71 L151.85 141.99 L151.28 142.27 L150.72 142.56 L150.17 142.85 L149.64 143.15 L149.13 143.47 L148.63 143.79 L148.15 144.12 L147.68 144.46 L147.23 144.82 L146.79 145.19 L146.37 145.57 L145.96 145.96 L145.57 146.37 L145.19 146.79 L144.82 147.23 L144.46 147.68 L144.12 148.15 L143.79 148.63 L143.47 149.13 L143.15 149.64 L142.85 150.17 L142.56 150.72 L142.27 151.28 L141.99 151.85 L141.71 152.44 L141.44 153.04 L141.17 153.66 L140.91 154.29 L140.65 154.93 L140.39 155.59 L140.13 156.25 L139.86 156.93 L139.60 157.62 L139.33 158.31 L139.06 159.02 L138.79 159.73 L138.51 160.45 L138.22 161.17 L137.93 161.89 L137.63 162.62 L137.32 163.35 L137.00 164.09 L136.67 164.82 L136.33 165.54 L135.98 166.27 L135.62 166.99 L135.24 167.70 L134.86 168.41 L134.46 169.11 L134.04 169.80 L133.62 170.48 L133.18 171.15 L132.72 171.80 L132.25 172.44 L131.77 173.06 L131.27 173.66 L130.75 174.25 L130.23 174.81 L129.68 175.36 L129.13 175.88 L128.56 176.38 L127.98 176.86 L127.38 177.31 L126.77 177.74 L126.15 178.14 L125.51 178.52 L124.87 178.87 L124.21 179.19 L123.54 179.48 L122.86 179.74 L122.18 179.97 L121.48 180.17 L120.78 180.34 L120.07 180.49 L119.35 180.60 L118.63 180.68 L117.90 180.73 L117.17 180.76 L116.43 180.75 L115.69 180.71 L114.95 180.65 L114.20 180.55 L113.46 180.43 L112.72 180.28 L111.97 180.10 L111.23 179.90 L110.49 179.68 L109.75 179.43 L109.02 179.15 L108.29 178.86 L107.56 178.54 L106.84 178.20 L106.13 177.85 L105.42 177.47 L104.71 177.08 L104.02 176.68 L103.33 176.26 L102.65 175.82 L101.97 175.38 L101.31 174.93 L100.65 174.47 L100.00 174.00 L99.36 173.53 L98.72 173.05 L98.10 172.57 L97.48 172.08 L96.87 171.60 L96.27 171.12 L95.68 170.64 L95.09 170.17 L94.51 169.70 L93.94 169.24 L93.38 168.78 L92.82 168.33 L92.26 167.90 L91.72 167.47 L91.17 167.06 L90.63 166.66 L90.10 166.27 L89.56 165.90 L89.03 165.54 L88.50 165.20 L87.98 164.88 L87.45 164.57 L86.92 164.28 L86.39 164.01 L85.87 163.76 L85.33 163.53 L84.80 163.31 L84.26 163.12 L83.72 162.94 L83.18 162.79 L82.63 162.65 L82.07 162.53 L81.51 162.43 L80.94 162.35 L80.36 162.28 L79.78 162.24 L79.19 162.21 L78.58 162.19 L77.98 162.20 L77.36 162.21 L76.73 162.24 L76.09 162.29 L75.44 162.34 L74.78 162.41 L74.12 162.49 L73.44 162.57 L72.75 162.67 L72.05 162.77 L71.35 162.88 L70.63 162.99 L69.90 163.10 L69.17 163.22 L68.42 163.34 L67.67 163.46 L66.91 163.57 L66.14 163.69 L65.36 163.80 L64.58 163.90 L63.79 164.00 L63.00 164.09 L62.20 164.17 L61.40 164.24 L60.60 164.30 L59.79 164.34 L58.99 164.38 L58.18 164.39 L57.38 164.40 L56.57 164.38 L55.77 164.35 L54.97 164.30 L54.18 164.24 L53.39 164.15 L52.61 164.04 L51.84 163.91 L51.08 163.76 L50.32 163.58 L49.58 163.39 L48.85 163.17 L48.13 162.92 L47.42 162.66 L46.73 162.37 L46.06 162.05 L45.40 161.72 L44.76 161.35 L44.13 160.97 L43.53 160.56 L42.94 160.13 L42.38 159.67 L41.83 159.19 L41.31 158.69 L40.81 158.17 L40.33 157.62 L39.87 157.06 L39.44 156.47 L39.03 155.87 L38.65 155.24 L38.28 154.60 L37.95 153.94 L37.63 153.27 L37.34 152.58 L37.08 151.87 L36.83 151.15 L36.61 150.42 L36.42 149.68 L36.24 148.92 L36.09 148.16 L35.96 147.39 L35.85 146.61 L35.76 145.82 L35.70 145.03 L35.65 144.23 L35.62 143.43 L35.60 142.62 L35.61 141.82 L35.62 141.01 L35.66 140.21 L35.70 139.40 L35.76 138.60 L35.83 137.80 L35.91 137.00 L36.00 136.21 L36.10 135.42 L36.20 134.64 L36.31 133.86 L36.43 133.09 L36.54 132.33 L36.66 131.58 L36.78 130.83 L36.90 130.10 L37.01 129.37 L37.12 128.65 L37.23 127.95 L37.33 127.25 L37.43 126.56 L37.51 125.88 L37.59 125.22 L37.66 124.56 L37.71 123.91 L37.76 123.27 L37.79 122.64 L37.80 122.02 L37.81 121.42 L37.79 120.81 L37.76 120.22 L37.72 119.64 L37.65 119.06 L37.57 118.49 L37.47 117.93 L37.35 117.37 L37.21 116.82 L37.06 116.28 L36.88 115.74 L36.69 115.20 L36.47 114.67 L36.24 114.13 L35.99 113.61 L35.72 113.08 L35.43 112.55 L35.12 112.02 L34.80 111.50 L34.46 110.97 L34.10 110.44 L33.73 109.90 L33.34 109.37 L32.94 108.83 L32.53 108.28 L32.10 107.74 L31.67 107.18 L31.22 106.62 L30.76 106.06 L30.30 105.49 L29.83 104.91 L29.36 104.32 L28.88 103.73 L28.40 103.13 L27.92 102.52 L27.43 101.90 L26.95 101.28 L26.47 100.64 L26.00 100.00 L25.53 99.35 L25.07 98.69 L24.62 98.03 L24.18 97.35 L23.74 96.67 L23.32 95.98 L22.92 95.29 L22.53 94.58 L22.15 93.87 L21.80 93.16 L21.46 92.44 L21.14 91.71 L20.85 90.98 L20.57 90.25 L20.32 89.51 L20.10 88.77 L19.90 88.03 L19.72 87.28 L19.57 86.54 L19.45 85.80 L19.35 85.05 L19.29 84.31 L19.25 83.57 L19.24 82.83 L19.27 82.10 L19.32 81.37 L19.40 80.65 L19.51 79.93 L19.66 79.22 L19.83 78.52 L20.03 77.82 L20.26 77.14 L20.52 76.46 L20.81 75.79 L21.13 75.13 L21.48 74.49 L21.86 73.85 L22.26 73.23 L22.69 72.62 L23.14 72.02 L23.62 71.44 L24.12 70.87 L24.64 70.32 L25.19 69.77 L25.75 69.25 L26.34 68.73 L26.94 68.23 L27.56 67.75 L28.20 67.28 L28.85 66.82 L29.52 66.38 L30.20 65.96 L30.89 65.54 L31.59 65.14 L32.30 64.76 L33.01 64.38 L33.73 64.02 L34.46 63.67 L35.18 63.33 L35.91 63.00 L36.65 62.68 L37.38 62.37 L38.11 62.07 L38.83 61.78 L39.55 61.49 L40.27 61.21 L40.98 60.94 L41.69 60.67 L42.38 60.40 L43.07 60.14 L43.75 59.87 L44.41 59.61 L45.07 59.35 L45.71 59.09 L46.34 58.83 L46.96 58.56 L47.56 58.29 L48.15 58.01 L48.72 57.73 L49.28 57.44 L49.83 57.15 L50.36 56.85 L50.87 56.53 L51.37 56.21 L51.85 55.88 L52.32 55.54 L52.77 55.18 L53.21 54.81 L53.63 54.43 L54.04 54.04 L54.43 53.63 L54.81 53.21 L55.18 52.77 L55.54 52.32 L55.88 51.85 L56.21 51.37 L56.53 50.87 L56.85 50.36 L57.15 49.83 L57.44 49.28 L57.73 48.72 L58.01 48.15 L58.29 47.56 L58.56 46.96 L58.83 46.34 L59.09 45.71 L59.35 45.07 L59.61 44.41 L59.87 43.75 L60.14 43.07 L60.40 42.38 L60.67 41.69 L60.94 40.98 L61.21 40.27 L61.49 39.55 L61.78 38.83 L62.07 38.11 L62.37 37.38 L62.68 36.65 L63.00 35.91 L63.33 35.18 L63.67 34.46 L64.02 33.73 L64.38 33.01 L64.76 32.30 L65.14 31.59 L65.54 30.89 L65.96 30.20 L66.38 29.52 L66.82 28.85 L67.28 28.20 L67.75 27.56 L68.23 26.94 L68.73 26.34 L69.25 25.75 L69.77 25.19 L70.32 24.64 L70.87 24.12 L71.44 23.62 L72.02 23.14 L72.62 22.69 L73.23 22.26 L73.85 21.86 L74.49 21.48 L75.13 21.13 L75.79 20.81 L76.46 20.52 L77.14 20.26 L77.82 20.03 L78.52 19.83 L79.22 19.66 L79.93 19.51 L80.65 19.40 L81.37 19.32 L82.10 19.27 L82.83 19.24 L83.57 19.25 L84.31 19.29 L85.05 19.35 L85.80 19.45 L86.54 19.57 L87.28 19.72 L88.03 19.90 L88.77 20.10 L89.51 20.32 L90.25 20.57 L90.98 20.85 L91.71 21.14 L92.44 21.46 L93.16 21.80 L93.87 22.15 L94.58 22.53 L95.29 22.92 L95.98 23.32 L96.67 23.74 L97.35 24.18 L98.03 24.62 L98.69 25.07 L99.35 25.53 L100.00 26.00 L100.64 26.47 L101.28 26.95 L101.90 27.43 L102.52 27.92 L103.13 28.40 L103.73 28.88 L104.32 29.36 L104.91 29.83 L105.49 30.30 L106.06 30.76 L106.62 31.22 L107.18 31.67 L107.74 32.10 L108.28 32.53 L108.83 32.94 L109.37 33.34 L109.90 33.73 L110.44 34.10 L110.97 34.46 L111.50 34.80 L112.02 35.12 L112.55 35.43 L113.08 35.72 L113.61 35.99 L114.13 36.24 L114.67 36.47 L115.20 36.69 L115.74 36.88 L116.28 37.06 L116.82 37.21 L117.37 37.35 L117.93 37.47 L118.49 37.57 L119.06 37.65 L119.64 37.72 L120.22 37.76 L120.81 37.79 L121.42 37.81 L122.02 37.80 L122.64 37.79 L123.27 37.76 L123.91 37.71 L124.56 37.66 L125.22 37.59 L125.88 37.51 L126.56 37.43 L127.25 37.33 L127.95 37.23 L128.65 37.12 L129.37 37.01 L130.10 36.90 L130.83 36.78 L131.58 36.66 L132.33 36.54 L133.09 36.43 L133.86 36.31 L134.64 36.20 L135.42 36.10 L136.21 36.00 L137.00 35.91 L137.80 35.83 L138.60 35.76 L139.40 35.70 L140.21 35.66 L141.01 35.62 L141.82 35.61 L142.62 35.60 L143.43 35.62 L144.23 35.65 L145.03 35.70 L145.82 35.76 L146.61 35.85 L147.39 35.96 L148.16 36.09 L148.92 36.24 L149.68 36.42 L150.42 36.61 L151.15 36.83 L151.87 37.08 L152.58 37.34 L153.27 37.63 L153.94 37.95 L154.60 38.28 L155.24 38.65 L155.87 39.03 L156.47 39.44 L157.06 39.87 L157.62 40.33 L158.17 40.81 L158.69 41.31 L159.19 41.83 L159.67 42.38 L160.13 42.94 L160.56 43.53 L160.97 44.13 L161.35 44.76 L161.72 45.40 L162.05 46.06 L162.37 46.73 L162.66 47.42 L162.92 48.13 L163.17 48.85 L163.39 49.58 L163.58 50.32 L163.76 51.08 L163.91 51.84 L164.04 52.61 L164.15 53.39 L164.24 54.18 L164.30 54.97 L164.35 55.77 L164.38 56.57 L164.40 57.38 L164.39 58.18 L164.38 58.99 L164.34 59.79 L164.30 60.60 L164.24 61.40 L164.17 62.20 L164.09 63.00 L164.00 63.79 L163.90 64.58 L163.80 65.36 L163.69 66.14 L163.57 66.91 L163.46 67.67 L163.34 68.42 L163.22 69.17 L163.10 69.90 L162.99 70.63 L162.88 71.35 L162.77 72.05 L162.67 72.75 L162.57 73.44 L162.49 74.12 L162.41 74.78 L162.34 75.44 L162.29 76.09 L162.24 76.73 L162.21 77.36 L162.20 77.98 L162.19 78.58 L162.21 79.19 L162.24 79.78 L162.28 80.36 L162.35 80.94 L162.43 81.51 L162.53 82.07 L162.65 82.63 L162.79 83.18 L162.94 83.72 L163.12 84.26 L163.31 84.80 L163.53 85.33 L163.76 85.87 L164.01 86.39 L164.28 86.92 L164.57 87.45 L164.88 87.98 L165.20 88.50 L165.54 89.03 L165.90 89.56 L166.27 90.10 L166.66 90.63 L167.06 91.17 L167.47 91.72 L167.90 92.26 L168.33 92.82 L168.78 93.38 L169.24 93.94 L169.70 94.51 L170.17 95.09 L170.64 95.68 L171.12 96.27 L171.60 96.87 L172.08 97.48 L172.57 98.10 L173.05 98.72 L173.53 99.36Z';
  var WORD = '<g transform="translate(236.0 58.0)"><g transform="translate(0 100.0) scale(0.13158)"><path d="M36 0V-279V-700H198V-568Q198 -547 195.5 -512.5Q193 -478 188.5 -439.0Q184 -400 179.5 -364.5Q175 -329 172 -305H181Q190 -388 212.0 -440.5Q234 -493 272.0 -517.5Q310 -542 364 -542Q449 -542 490.0 -481.5Q531 -421 531 -299V0H369V-292Q369 -348 354.0 -374.0Q339 -400 305 -400Q275 -400 251.0 -377.5Q227 -355 212.5 -306.0Q198 -257 198 -179V0Z M831 14Q756 14 705.5 -7.5Q655 -29 624.0 -66.5Q593 -104 579.5 -152.0Q566 -200 566 -253Q566 -310 580.5 -362.0Q595 -414 625.5 -454.5Q656 -495 704.5 -518.5Q753 -542 821 -542Q889 -542 937.5 -518.5Q986 -495 1015.0 -453.0Q1044 -411 1052.5 -356.0Q1061 -301 1050 -237L667 -231V-319L926 -324L905 -273Q911 -319 903.5 -350.5Q896 -382 876.0 -398.5Q856 -415 821 -415Q784 -415 762.0 -396.0Q740 -377 731.0 -342.5Q722 -308 722 -261Q722 -180 749.0 -143.0Q776 -106 832 -106Q856 -106 872.0 -112.0Q888 -118 898.0 -129.5Q908 -141 912.0 -157.5Q916 -174 915 -195L1063 -187Q1066 -154 1056.5 -119.0Q1047 -84 1021.0 -54.0Q995 -24 948.5 -5.0Q902 14 831 14Z M1099 0V-287V-528H1239V-318H1247Q1253 -402 1270.5 -450.5Q1288 -499 1314.5 -519.5Q1341 -540 1374 -540Q1392 -540 1411.5 -535.0Q1431 -530 1450 -519L1442 -339Q1420 -352 1399.0 -358.5Q1378 -365 1359 -365Q1327 -365 1305.0 -347.0Q1283 -329 1271.5 -294.0Q1260 -259 1260 -209V0Z M1732 14Q1657 14 1606.5 -7.5Q1556 -29 1525.0 -66.5Q1494 -104 1480.5 -152.0Q1467 -200 1467 -253Q1467 -310 1481.5 -362.0Q1496 -414 1526.5 -454.5Q1557 -495 1605.5 -518.5Q1654 -542 1722 -542Q1790 -542 1838.5 -518.5Q1887 -495 1916.0 -453.0Q1945 -411 1953.5 -356.0Q1962 -301 1951 -237L1568 -231V-319L1827 -324L1806 -273Q1812 -319 1804.5 -350.5Q1797 -382 1777.0 -398.5Q1757 -415 1722 -415Q1685 -415 1663.0 -396.0Q1641 -377 1632.0 -342.5Q1623 -308 1623 -261Q1623 -180 1650.0 -143.0Q1677 -106 1733 -106Q1757 -106 1773.0 -112.0Q1789 -118 1799.0 -129.5Q1809 -141 1813.0 -157.5Q1817 -174 1816 -195L1964 -187Q1967 -154 1957.5 -119.0Q1948 -84 1922.0 -54.0Q1896 -24 1849.5 -5.0Q1803 14 1732 14Z M2231 14Q2178 14 2132.5 3.5Q2087 -7 2053.5 -30.0Q2020 -53 2002.5 -91.5Q1985 -130 1988 -185L2129 -197Q2131 -164 2144.0 -142.5Q2157 -121 2180.0 -111.0Q2203 -101 2236 -101Q2267 -101 2289.5 -111.5Q2312 -122 2312 -147Q2312 -160 2304.0 -168.5Q2296 -177 2274.5 -184.5Q2253 -192 2212 -202Q2161 -215 2120.0 -228.0Q2079 -241 2050.0 -259.0Q2021 -277 2006.0 -303.5Q1991 -330 1991 -369Q1991 -424 2020.5 -462.5Q2050 -501 2102.0 -521.5Q2154 -542 2222 -542Q2283 -542 2336.0 -523.0Q2389 -504 2419.5 -461.0Q2450 -418 2442 -347L2304 -334Q2307 -363 2296.0 -383.5Q2285 -404 2264.0 -414.5Q2243 -425 2213 -425Q2179 -425 2160.5 -412.5Q2142 -400 2142 -381Q2142 -366 2153.5 -355.5Q2165 -345 2189.5 -337.5Q2214 -330 2253 -321Q2287 -314 2324.0 -303.0Q2361 -292 2393.0 -273.5Q2425 -255 2445.0 -225.0Q2465 -195 2465 -149Q2465 -100 2438.0 -63.0Q2411 -26 2359.0 -6.0Q2307 14 2231 14Z M2638 14Q2598 14 2562.0 0.0Q2526 -14 2503.0 -45.5Q2480 -77 2480 -130Q2480 -179 2499.0 -209.5Q2518 -240 2550.0 -258.5Q2582 -277 2620.0 -286.5Q2658 -296 2695 -303Q2747 -313 2773.0 -319.0Q2799 -325 2808.5 -333.0Q2818 -341 2818 -355Q2818 -384 2796.5 -399.0Q2775 -414 2740 -414Q2718 -414 2696.0 -406.0Q2674 -398 2660.0 -377.5Q2646 -357 2647 -319L2503 -329Q2501 -392 2522.0 -433.5Q2543 -475 2579.5 -498.5Q2616 -522 2659.5 -532.0Q2703 -542 2746 -542Q2825 -542 2876.0 -512.5Q2927 -483 2951.5 -427.5Q2976 -372 2976 -293V-199Q2976 -166 2976.0 -132.5Q2976 -99 2976.0 -66.0Q2976 -33 2976 0H2836Q2836 -36 2836.0 -73.0Q2836 -110 2836 -151H2830Q2826 -106 2800.5 -68.5Q2775 -31 2733.5 -8.5Q2692 14 2638 14ZM2705 -104Q2722 -104 2741.5 -110.5Q2761 -117 2778.5 -132.0Q2796 -147 2807.0 -173.5Q2818 -200 2818 -239V-263L2845 -266Q2837 -253 2818.5 -245.0Q2800 -237 2777.0 -232.5Q2754 -228 2730.5 -223.5Q2707 -219 2687.0 -211.5Q2667 -204 2654.5 -191.5Q2642 -179 2642 -157Q2642 -131 2660.5 -117.5Q2679 -104 2705 -104Z M3213 156Q3183 156 3147.0 151.0Q3111 146 3075.0 135.0Q3039 124 3008 107L3045 -56Q3081 -22 3125.5 -8.0Q3170 6 3205 6Q3254 6 3287.5 -13.5Q3321 -33 3338.0 -70.5Q3355 -108 3355 -162V-254H3346Q3344 -184 3323.5 -139.5Q3303 -95 3268.0 -74.0Q3233 -53 3187 -53Q3130 -53 3092.5 -82.0Q3055 -111 3036.0 -169.0Q3017 -227 3017 -314V-528H3178V-356Q3178 -271 3196.0 -232.0Q3214 -193 3253 -193Q3273 -193 3288.5 -203.5Q3304 -214 3314.0 -235.5Q3324 -257 3329.0 -289.5Q3334 -322 3334 -365V-528H3495V-156Q3495 -102 3484.0 -54.5Q3473 -7 3451.0 31.5Q3429 70 3395.5 98.0Q3362 126 3316.5 141.0Q3271 156 3213 156Z" fill="#0b5e57"/></g></g>';
  var EYE = 'M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z';
  var gs = function () { return window.gsap || null; };

  /* ---------------------------------------------------------------- sound */
  var sfx = (function () {
    var on = false, ctx = null, last = 0;
    try { on = localStorage.getItem('heresay-sound') === 'on'; } catch (e) {}
    function ac() {
      if (!ctx) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(f0, f1, dur, vol, type) {
      var a = ac(); if (!a) return;
      var t = a.currentTime, o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
    }
    function guard(gap) { var n = performance.now(); if (!on || n - last < gap) return false; last = n; return true; }
    return {
      get on() { return on; },
      set: function (v) { on = v; try { localStorage.setItem('heresay-sound', v ? 'on' : 'off'); } catch (e) {} if (v) { ac(); tone(520, 780, 0.09, 0.05); } },
      blip: function () { if (guard(70)) tone(900, 1300, 0.055, 0.025); },
      pop: function () { if (guard(110)) { tone(260, 640, 0.1, 0.05); } },
      thunk: function () { if (!on) return; tone(150, 48, 0.2, 0.16); tone(90, 40, 0.14, 0.1, 'triangle'); },
      chime: function () { if (!on) return; tone(660, 990, 0.14, 0.04); setTimeout(function () { tone(990, 1320, 0.16, 0.035); }, 90); }
    };
  })();

  /* --------------------------------------------------------------- loader */
  (function loader() {
    var L = q('#hs-loader');
    if (!L) return;
    if (!de.classList.contains('hs-loading')) { L.remove(); return; }
    try { sessionStorage.setItem('hs-seen', '1'); } catch (e) {}
    var t0 = performance.now(), done = false, paused = false, fonts = false, hero = false;
    function resume() { if (paused && gs()) { paused = false; gs().globalTimeline.resume(); } }
    if (gs()) { gs().globalTimeline.pause(); paused = true; }
    setTimeout(resume, 1750);
    function lift() {
      if (done) return; done = true;
      L.classList.add('lift'); de.classList.remove('hs-loading');
      setTimeout(resume, 160);
      setTimeout(function () { L.remove(); }, 1000);
    }
    function check() {
      if (done || !fonts || !hero) return;
      setTimeout(lift, Math.max(0, 1150 - (performance.now() - t0)));
    }
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () { fonts = true; check(); }); else fonts = true;
    var stage = q('#hero-stage');
    function isHero() { return !stage || stage.classList.contains('ready'); }
    if (isHero()) hero = true;
    else {
      var mo = new MutationObserver(function () { if (isHero()) { hero = true; mo.disconnect(); check(); } });
      mo.observe(stage, { attributes: true, attributeFilter: ['class'] });
      addEventListener('heresay:hero-formed', function () { hero = true; check(); }, { once: true });
    }
    check();
    setTimeout(lift, 1600);
  })();

  /* ------------------------------------------- live logo + topbar theme */
  (function nav() {
    var tb = q('#topbar'); if (!tb) return;
    var a = q('.nav > a', tb), img = a && q('img', a);
    var svg = null, eyes = null, eyeEls = [];
    if (img) {
      var wrap = d.createElement('div');
      wrap.innerHTML = '<svg class="logo-live" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700.08 200" width="161" height="46" role="img" aria-label="Heresay"><title>Heresay</title>' +
        '<path class="lg-b" d="' + BLOB + '"/><g class="lg-eyes">' +
        '<g class="lg-eye" style="transform-origin:80px 106px"><path class="lg-e" d="' + EYE + '" transform="translate(80 106) rotate(-24) scale(1.25)"/></g>' +
        '<g class="lg-eye" style="transform-origin:124px 101px"><path class="lg-e" d="' + EYE + '" transform="translate(124 101) rotate(-24) scale(1.25)"/></g></g>' +
        WORD.replace('fill="#0b5e57"', 'class="lg-w"') + '</svg>';
      svg = wrap.firstChild; img.replaceWith(svg);
      eyes = q('.lg-eyes', svg); eyeEls = qa('.lg-eye', svg);
      if (!reduce) {
        var px = null, py = null, pend = false;
        var aim = function () {
          pend = false; if (px === null) return;
          var r = svg.getBoundingClientRect(), cx = r.left + r.width * (100 / 700.08), cy = r.top + r.height * 0.5;
          var dx = px - cx, dy = py - cy, dist = Math.hypot(dx, dy) || 1, m = 8 * clamp(dist / 70, 0, 1);
          eyes.style.transform = 'translate(' + (dx / dist * m).toFixed(2) + 'px,' + (dy / dist * m).toFixed(2) + 'px)';
        };
        addEventListener('pointermove', function (e) { px = e.clientX; py = e.clientY; if (!pend) { pend = true; requestAnimationFrame(aim); } }, { passive: true });
        (function blinkLoop() {
          setTimeout(function () {
            eyeEls.forEach(function (e) { e.classList.add('bl'); });
            setTimeout(function () { eyeEls.forEach(function (e) { e.classList.remove('bl'); }); blinkLoop(); }, 130);
          }, 1800 + Math.random() * 3800);
        })();
      }
    }
    /* dark chapters under the bar */
    var darks = qa('[data-theme="dark"]'), veil = q('#dive-veil'), heroEl = q('#top'), cur = '', tick = false;
    function theme() {
      tick = false;
      var y = 38, dark = false;
      darks.forEach(function (s) {
        var r = s.getBoundingClientRect();
        if (r.top <= y && r.bottom >= y) {
          dark = true;
          var w = q('.hall-white', s);
          if (w) { var cs = getComputedStyle(w); if (cs.display !== 'none' && parseFloat(cs.opacity) > 0.5) dark = false; }
        }
      });
      if (!dark && veil && heroEl) {
        var hr = heroEl.getBoundingClientRect();
        if (hr.top <= y && hr.bottom >= y) {
          var vs = getComputedStyle(veil), vr = parseFloat(vs.getPropertyValue('--vr'));
          if (!isNaN(vr)) { /* the veil is an expanding circle: dark once it reaches both ends of the bar */
            var vx = parseFloat(vs.getPropertyValue('--vx')) || innerWidth / 2, vy = parseFloat(vs.getPropertyValue('--vy')) || innerHeight / 2;
            var far = Math.max(Math.hypot(vx, vy - y), Math.hypot(innerWidth - vx, vy - y));
            if (vr - 40 >= far) dark = true;
          } else if (parseFloat(getComputedStyle(veil).opacity) > 0.6) dark = true;
        }
      }
      var t = dark ? 'dark' : 'light';
      if (t !== cur) { cur = t; tb.setAttribute('data-theme', t); }
    }
    function req() { if (!tick) { tick = true; requestAnimationFrame(theme); } }
    addEventListener('scroll', req, { passive: true }); addEventListener('resize', req);
    theme();
  })();

  /* --------------------------------------------------------------- cursor */
  var cursorHooks = { face: false };
  (function cursor() {
    if (reduce || !fine) return;
    var el = d.createElement('div'); el.className = 'hs-cur'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span></span>'; d.body.appendChild(el);
    var t = el.firstChild, mx = -100, my = -100, x = -100, y = -100, seen = false, say = false, dark = false, over = false;
    function word(n) {
      if (cursorHooks.face) return 'Hi';
      if (!n || !n.closest) return '';
      var c = n.closest('[data-cursor]'); if (c) return c.getAttribute('data-cursor');
      if (n.closest('input,textarea')) return 'Say it';
      if (n.closest('summary,a')) return 'Open';
      if (n.closest('button')) return 'Press';
      return '';
    }
    addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      mx = e.clientX; my = e.clientY;
      if (!seen) { seen = true; x = mx; y = my; }
      if (!over) { over = true; el.classList.add('on'); }
      var w = word(e.target);
      if (w) { if (t.textContent !== w) t.textContent = w; if (!say) { say = true; el.classList.add('say'); } }
      else if (say) { say = false; el.classList.remove('say'); }
      var dk = !!(e.target.closest && e.target.closest('[data-theme="dark"]'));
      if (dk !== dark) { dark = dk; el.classList.toggle('dk', dk); }
    }, { passive: true });
    de.addEventListener('mouseleave', function () { over = false; el.classList.remove('on'); });
    d.addEventListener('pointerdown', function () { el.classList.add('dn'); });
    addEventListener('pointerup', function () { el.classList.remove('dn'); });
    (function loop() {
      x += (mx - x) * 0.24; y += (my - y) * 0.24;
      el.style.transform = 'translate3d(' + (x + (say ? 16 : -6)).toFixed(1) + 'px,' + (y + (say ? 18 : -6)).toFixed(1) + 'px,0)';
      requestAnimationFrame(loop);
    })();
  })();

  /* ----------------------------------------------------- sound: global hooks + toggle */
  (function soundUi() {
    var btn = q('#snd');
    if (btn) {
      btn.hidden = false;
      var paint = function () { btn.setAttribute('aria-pressed', sfx.on ? 'true' : 'false'); q('b', btn).textContent = sfx.on ? 'on' : 'off'; };
      btn.addEventListener('click', function () { sfx.set(!sfx.on); paint(); });
      paint();
    }
    if (!fine) return;
    var last = null;
    d.addEventListener('pointerover', function (e) {
      var n = e.target.closest && e.target.closest('a,button,summary,[data-cursor]');
      if (n && n !== last) sfx.blip();
      last = n;
    }, { passive: true });
  })();

  /* ---------------------------------------------------------- setup toy */
  (function setup() {
    var root = q('#su-play'); if (!root) return;
    var g = gs();
    var chip = q('#chip'), mock = q('#mock'), fab = q('#mk-fab'), panel = q('#mk-panel'), btn = q('#sp-drop'), status = q('#sp-status'),
      slot = q('#sp-slot'), over = q('.mk-over', mock), body = q('.mk-body', mock);
    if (!chip || !mock || !fab || !panel) return;
    root.classList.add('live');
    var state = 'idle', drag = null, panelOpen = false;

    function say(t) { if (status) status.textContent = t; }
    function inMock(x, y) { var r = body.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }

    function ripple(x, y) {
      [0, 0.12].forEach(function (dl, i) {
        var r = d.createElement('span'); r.className = 'mk-rip' + (i ? ' b' : '');
        r.style.left = x + 'px'; r.style.top = y + 'px'; body.appendChild(r);
        if (g) g.fromTo(r, { scale: 0, opacity: 0.55 }, { scale: 14, opacity: 0, duration: 1.1, delay: dl, ease: 'power2.out', onComplete: function () { r.remove(); } });
        else setTimeout(function () { r.remove(); }, 600);
      });
    }
    function showFab() {
      mock.classList.add('is-installed'); slot.classList.add('done');
      if (btn) btn.textContent = 'Reset';
      say('Installed. Click the Report button in the corner of the page.');
      if (g && !reduce) {
        g.fromTo(fab, { scale: 0, y: 26, rotation: -14, transformOrigin: '100% 100%' }, { scale: 1, y: 0, rotation: 0, duration: 0.95, ease: 'back.out(2.8)', onComplete: function () { fab.classList.add('hint'); } });
        g.fromTo(body.children, { y: 0 }, { y: 0 }); /* no-op, keeps skeleton stable */
        g.fromTo(q('.mk-page', body), { scale: 1 }, { scale: 1.012, duration: 0.14, yoyo: true, repeat: 1, ease: 'power2.out' });
      } else { g && g.set(fab, { scale: 1, y: 0, rotation: 0 }); fab.classList.add('hint'); }
      state = 'installed';
    }
    function install(pt) {
      if (state !== 'idle') return; state = 'installing';
      mock.classList.remove('is-over');
      var mr = body.getBoundingClientRect(), cr = chip.getBoundingClientRect();
      var tx = pt ? clamp(pt.x, mr.left + 20, mr.right - 20) : mr.left + mr.width * 0.5;
      var ty = pt ? clamp(pt.y, mr.top + 20, mr.bottom - 20) : mr.top + mr.height * 0.58;
      var dx = tx - (cr.left + cr.width / 2), dy = ty - (cr.top + cr.height / 2);
      if (!g || reduce) { chip.style.visibility = 'hidden'; showFab(); return; }
      var tl = g.timeline();
      tl.to(chip, { x: '+=' + dx, y: '+=' + dy, scale: 0.28, rotation: 0, duration: 0.45, ease: 'power3.in' })
        .add(function () { sfx.thunk(); ripple(tx - mr.left, ty - mr.top); }, '>')
        .to(chip, { opacity: 0, scale: 0.04, filter: 'blur(8px)', duration: 0.4, ease: 'power2.out' }, '>-0.02')
        .add(showFab, '>-0.28');
    }
    function reset() {
      if (state === 'installing') return;
      closePanel(true); fab.classList.remove('hint');
      mock.classList.remove('is-installed'); slot.classList.remove('done');
      if (g) { g.set(fab, { clearProps: 'all' }); g.killTweensOf(chip); g.set(chip, { clearProps: 'all' }); g.fromTo(chip, { opacity: 0, y: -14 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', clearProps: 'all' }); }
      chip.style.visibility = ''; if (drag) { drag.enable(); drag.update(); }
      if (btn) btn.textContent = 'Drop it in';
      say(''); state = 'idle';
    }

    /* the mock report panel */
    function openPanel() {
      if (panelOpen || state !== 'installed') return; panelOpen = true; fab.classList.remove('hint');
      panel.hidden = false; fab.setAttribute('aria-expanded', 'true'); panel.classList.remove('sent');
      if (g && !reduce) g.fromTo(panel, { opacity: 0, y: 14, scale: 0.9, transformOrigin: '100% 100%' }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(2.2)' });
      sfx.chime();
    }
    function closePanel(now) {
      if (!panelOpen) return; panelOpen = false; fab.setAttribute('aria-expanded', 'false');
      if (g && !reduce && !now) g.to(panel, { opacity: 0, y: 10, scale: 0.94, duration: 0.25, ease: 'power2.in', onComplete: function () { panel.hidden = true; } });
      else { if (g) g.killTweensOf(panel); panel.hidden = true; }
    }
    fab.addEventListener('click', function () { panelOpen ? closePanel() : openPanel(); });
    q('.mk-x', panel).addEventListener('click', function () { closePanel(); fab.focus(); });
    var types = qa('.mk-t', panel);
    types.forEach(function (b) {
      b.addEventListener('click', function () { types.forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); }); });
    });
    q('.mk-send', panel).addEventListener('click', function () {
      panel.classList.add('sent'); sfx.chime();
      setTimeout(function () { closePanel(); setTimeout(function () { panel.classList.remove('sent'); }, 400); }, 1700);
    });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panelOpen) { closePanel(); fab.focus(); } });

    /* controls */
    if (btn) btn.addEventListener('click', function () { state === 'idle' ? install() : reset(); });
    chip.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); install(); } });

    /* drag */
    if (g && window.Draggable) {
      var plugins = [Draggable]; if (window.InertiaPlugin) plugins.push(InertiaPlugin);
      g.registerPlugin.apply(g, plugins);
      var token = 0;
      var settle = function () {
        if (state !== 'idle') return;
        var r = chip.getBoundingClientRect();
        if (inMock(r.left + r.width / 2, r.top + r.height / 2)) { install({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); return; }
        mock.classList.remove('is-over');
        g.to(chip, { x: 0, y: 0, rotation: 0, scale: 1, duration: 1, ease: 'elastic.out(1,0.55)', onComplete: function () { if (drag) drag.update(); } });
      };
      drag = Draggable.create(chip, {
        type: 'x,y', inertia: !!window.InertiaPlugin, zIndexBoost: true, edgeResistance: 0.9,
        onPress: function () { if (state !== 'idle') return; g.killTweensOf(chip); chip.classList.add('grab'); g.to(chip, { scale: 0.92, duration: 0.25, ease: 'power2.out' }); token++; },
        onDrag: function () {
          var e = this.pointerEvent; if (!e) return;
          mock.classList.toggle('is-over', inMock(e.clientX, e.clientY));
          g.to(chip, { rotation: clamp(this.deltaX * 0.7, -9, 9), duration: 0.2, overwrite: 'auto' });
        },
        onRelease: function () {
          chip.classList.remove('grab');
          var e = this.pointerEvent, my = token;
          if (e && state === 'idle' && inMock(e.clientX, e.clientY)) {
            var pt = { x: e.clientX, y: e.clientY };
            g.delayedCall(0, function () { drag.disable(); install(pt); });
          } else if (state === 'idle') {
            g.to(chip, { rotation: 0, scale: 1, duration: 0.3, overwrite: 'auto' });
            g.delayedCall(2.6, function () { if (my === token) settle(); });
          }
        },
        onThrowComplete: function () { if (state === 'idle') settle(); }
      })[0];
    }

    /* touch / narrow: play itself once when it scrolls into view */
    if (!fine || innerWidth <= 900) {
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (es) {
          if (es[0].isIntersecting) { io.disconnect(); setTimeout(function () { if (state === 'idle') install(); }, 900); }
        }, { threshold: 0.7 });
        io.observe(mock);
      }
    }
  })();

  /* ------------------------------------------------------- feature cards */
  (function features() {
    var g = gs(); if (!g) return;
    var cards = qa('.fc'); if (!cards.length || reduce) return;
    cards.forEach(function (cd) {
      var ic = q('.ic', cd), svg = q('svg', ic), strokes = qa('[pathLength]', svg), dots = qa('.dot,.half', svg), loop = null;
      function start() {
        if (loop) return;
        loop = g.timeline({ repeat: -1, repeatDelay: 0.35 });
        loop.to(svg, { y: -2.5, rotation: -3, duration: 0.45, ease: 'sine.inOut', yoyo: true, repeat: 1, transformOrigin: '50% 50%' }, 0);
        loop.fromTo(strokes, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, stagger: 0.12, ease: 'power2.inOut' }, 0);
        loop.fromTo(dots, { scale: 0 }, { scale: 1, duration: 0.5, ease: 'back.out(3)', transformOrigin: '50% 50%' }, 0.7);
      }
      function stop() {
        if (!loop) return; loop.kill(); loop = null;
        g.to(svg, { y: 0, rotation: 0, duration: 0.3 });
        g.set(strokes, { strokeDashoffset: 0 }); g.to(dots, { scale: 1, duration: 0.2 });
      }
      cd.addEventListener('pointerenter', function () {
        if (!strokes.length || g.getProperty(strokes[0], 'strokeDashoffset') > 0.01) return; /* intro still drawing */
        start();
      });
      cd.addEventListener('pointerleave', stop);
      if (fine) {
        var mx = g.quickTo(cd, 'x', { duration: 0.6, ease: 'power3' }), my = g.quickTo(cd, 'y', { duration: 0.6, ease: 'power3' });
        var ix = g.quickTo(ic, 'x', { duration: 0.5, ease: 'power3' }), iy = g.quickTo(ic, 'y', { duration: 0.5, ease: 'power3' });
        cd.addEventListener('pointermove', function (e) {
          var r = cd.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
          mx(px * 8); my(py * 8); ix(px * 14); iy(py * 14);
        });
        cd.addEventListener('pointerleave', function () { mx(0); my(0); ix(0); iy(0); });
      }
    });
  })();

  /* ---------------------------------------------------------- the crowd */
  (function crowd() {
    var sec = q('#closer'), cv = q('#crowd'); if (!sec || !cv) return;
    var ctx = cv.getContext('2d'); if (!ctx) return;
    var REPORTS = [
      'The export button does nothing.', 'Checkout hangs on a spinner.', 'Where did the Share button go?', 'Could you add a dark mode?',
      'Login loops back to the start.', 'Is my draft saved or not?', 'The sidebar feels cramped.', 'An undo for deletes, please.',
      'I can’t find where to cancel my plan.', 'Error messages are hard to read.', 'The date picker skips a day.', 'Search forgets what I typed.',
      'Tapping Save twice makes two copies.', 'Text is tiny on my phone.', 'Please let me reorder these.', 'The page flashes white on load.',
      'I got logged out for no reason.', 'Can I export this as a PDF?', 'The back button leaves the app.', 'Notifications never stop.'
    ];
    var COLORS = [
      { c: '#0b5e57', e: '#fff' }, { c: '#0f766e', e: '#fff' }, { c: '#0f766e', e: '#fff' }, { c: '#12897f', e: '#fff' },
      { c: '#2dd4bf', e: '#0b5e57' }, { c: '#5ee6d2', e: '#0b5e57' }, { c: '#0b5e57', e: '#2dd4bf' }
    ];
    var sprites = [], blobPath = new Path2D(BLOB), eyePath = new Path2D(EYE);
    COLORS.forEach(function (k) {
      var s = d.createElement('canvas'); s.width = s.height = 256; var x = s.getContext('2d');
      x.scale(1.28, 1.28); x.fillStyle = k.c; x.fill(blobPath); sprites.push(s);
    });
    var faces = [], W = 0, H = 0, dpr = 1, bub = q('#crowd-bub'), bubTxt = bub && q('span', bub);
    var vis = false, entered = false, running = false, hover = -1, repI = Math.floor(Math.random() * REPORTS.length), lastSay = -1;
    var P = { x: null, y: null }, look = null, cta = 0, ctaT = 0, tPrev = 0;
    var cta1 = q('.btn', sec);
    function rnd(a, b) { return a + Math.random() * (b - a); }

    function layout() {
      var r = sec.getBoundingClientRect(); W = Math.round(r.width); H = Math.round(r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      var ex = [];
      qa('.cl-mark,.cl-h,.ctas .btn', sec).forEach(function (n) {
        var x0 = 0, y0 = n.offsetTop, e = n, p = n.offsetParent;
        /* offsetTop relative to the section */
        y0 = 0; var o = n; while (o && o !== sec) { y0 += o.offsetTop; o = o.offsetParent; }
        var pad = n.classList.contains('cl-h') ? 6 : 26, w = n.offsetWidth, x = (W - w) / 2;
        if (n.classList.contains('cl-h')) { w = Math.min(w, W * 0.96); x = (W - w) / 2; }
        ex.push([x - pad, y0 - pad, x + w + pad, y0 + n.offsetHeight + pad]);
      });
      var small = W < 700, target = small ? 100 : 190, minS = small ? 26 : 34, maxS = small ? 54 : 84;
      var old = faces.length ? faces : null, out = [], tries = 0;
      while (out.length < target && tries < 30000) {
        tries++;
        var y = H * (1 - Math.pow(Math.random(), 1.5)), dd = clamp(y / H, 0, 1);
        var sz = (minS + (maxS - minS) * Math.pow(dd, 1.15)) * rnd(0.86, 1.16);
        var x = rnd(-sz * 0.2, W + sz * 0.2), rad = sz * 0.42, ok = true;
        if (y < sz * 0.6) continue;
        for (var i = 0; i < ex.length && ok; i++) if (x + rad > ex[i][0] && x - rad < ex[i][2] && y + rad > ex[i][1] && y - rad < ex[i][3]) ok = false;
        for (var j = 0; j < out.length && ok; j++) { var f = out[j]; if (Math.hypot(f.x - x, f.y - y) < (f.r + rad) * 0.66) ok = false; }
        if (!ok) continue;
        var col = Math.floor(Math.random() * COLORS.length);
        out.push({ x: x, y: y, sz: sz, r: rad, col: col, tilt: rnd(-0.14, 0.14), ph: rnd(0, 6.28), gx: 0, gy: 0, pop: (entered || reduce) ? 1 : 0, hov: 0,
          nb: rnd(0.8, 4.5), bs: -1, dbl: false });
      }
      out.sort(function (a, b) { return a.y - b.y; });
      faces = out; hover = -1;
      if (entered && g() && !reduce) faces.forEach(function (f) { f.pop = 1; });
      draw(performance.now());
    }
    function g() { return gs(); }

    function draw(now) {
      var t = now / 1000, R = cv.getBoundingClientRect();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      var order = faces;
      for (var i = 0; i <= faces.length; i++) {
        var idx = i; if (i === faces.length) { if (hover < 0) break; idx = hover; } else if (i === hover) continue;
        var f = order[idx], k = COLORS[f.col];
        if (f.pop <= 0.001) continue;
        /* blink */
        var bl = 1;
        if (!reduce) {
          if (f.bs < 0 && t > f.nb) { f.bs = t; }
          if (f.bs >= 0) { var u = (t - f.bs) / 0.15; if (u >= 1) { if (!f.dbl && Math.random() < 0.18) { f.dbl = true; f.bs = t + 0.05; } else { f.dbl = false; f.bs = -1; f.nb = t + rnd(1.6, 6.2); } } else if (u >= 0) bl = 1 - 0.92 * Math.sin(Math.PI * u); }
        }
        /* gaze */
        var tx = 0, ty = 0;
        if (!reduce) {
          var sx = R.left + f.x, sy = R.top + f.y, ax, ay;
          if (look) { ax = look.x; ay = look.y; } else if (P.x !== null) { ax = P.x; ay = P.y; } else { ax = sx + Math.cos(t * 0.35 + f.ph) * 100; ay = sy + Math.sin(t * 0.27 + f.ph) * 60; }
          var dx = ax - sx, dy = ay - sy, dist = Math.hypot(dx, dy) || 1, m = 9.5 * clamp(dist / (f.sz * 1.1), 0, 1);
          var ca = Math.cos(-f.tilt), sa = Math.sin(-f.tilt), ux = dx / dist * m, uy = dy / dist * m;
          tx = ux * ca - uy * sa; ty = ux * sa + uy * ca;
        }
        f.gx += (tx - f.gx) * 0.18; f.gy += (ty - f.gy) * 0.18;
        var s = f.pop * (1 + 0.2 * f.hov + 0.06 * cta) * f.sz / 200;
        var bob = reduce ? 0 : Math.sin(t * 1.1 + f.ph) * 1.4 - cta * Math.abs(Math.sin(t * 7 + f.ph)) * 3;
        ctx.save();
        ctx.translate(f.x, f.y + bob - 9 * f.hov); ctx.rotate(f.tilt); ctx.scale(s, s);
        if (idx === hover) { ctx.shadowColor = 'rgba(11,94,87,.3)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8; }
        ctx.drawImage(sprites[f.col], -100, -100, 200, 200);
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = k.e;
        [[80, 106], [124, 101]].forEach(function (e) {
          ctx.save(); ctx.translate(e[0] - 100 + f.gx, e[1] - 100 + f.gy); ctx.scale(1, bl); ctx.rotate(-24 * Math.PI / 180); ctx.scale(1.25, 1.25); ctx.fill(eyePath); ctx.restore();
        });
        ctx.restore();
      }
    }

    function frame(now) {
      if (!running) return;
      var dt = Math.min(0.05, (now - tPrev) / 1000 || 0.016); tPrev = now;
      cta += (ctaT - cta) * Math.min(1, dt * 8);
      faces.forEach(function (f) { f.hov += ((faces[hover] === f ? 1 : 0) - f.hov) * Math.min(1, dt * 14); });
      draw(now);
      requestAnimationFrame(frame);
    }
    function run() { if (running || reduce) return; running = true; tPrev = performance.now(); requestAnimationFrame(frame); }
    function stop() { running = false; }

    /* interaction */
    function hit(cx, cy) {
      var R = cv.getBoundingClientRect(), x = cx - R.left, y = cy - R.top;
      if (x < 0 || y < 0 || x > R.width || y > R.height) return -1;
      for (var i = faces.length - 1; i >= 0; i--) { var f = faces[i]; if (f.pop > 0.6 && Math.hypot(f.x - x, f.y - 3 - y) < f.r * 1.02) return i; }
      return -1;
    }
    function showBubble(i) {
      if (!bub) return;
      if (i < 0) { bub.classList.remove('on'); return; }
      var f = faces[i];
      if (lastSay !== i) { bubTxt.textContent = REPORTS[repI++ % REPORTS.length]; lastSay = i; }
      var w = bub.offsetWidth || 180;
      bub.style.left = clamp(f.x, w / 2 + 8, W - w / 2 - 8) + 'px'; bub.style.top = (f.y - f.r * 1.2 - 12) + 'px';
      bub.style.setProperty('--tail', (f.x - clamp(f.x, w / 2 + 8, W - w / 2 - 8)) + 'px');
      bub.classList.add('on');
    }
    function setHover(i) {
      if (i === hover) return;
      var was = hover; hover = i;
      cursorHooks.face = i >= 0;
      if (i >= 0) { sfx.pop(); } else lastSay = -1;
      showBubble(i); void was;
    }
    if (!reduce) {
      addEventListener('pointermove', function (e) {
        P.x = e.clientX; P.y = e.clientY;
        if (!vis || e.pointerType === 'touch') return;
        var over = e.target.closest && e.target.closest('a,button,h2');
        setHover(over ? -1 : hit(e.clientX, e.clientY));
      }, { passive: true });
      sec.addEventListener('pointerleave', function () { setHover(-1); });
      sec.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'touch' || (e.target.closest && e.target.closest('a,button'))) return;
        P.x = e.clientX; P.y = e.clientY; lastSay = -1; setHover(-1); setHover(hit(e.clientX, e.clientY));
        clearTimeout(sec._t); sec._t = setTimeout(function () { setHover(-1); }, 2200);
      }, { passive: true });
      if (cta1) {
        var on = function () { var r = cta1.getBoundingClientRect(); look = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; ctaT = 1; };
        var off = function () { look = null; ctaT = 0; };
        cta1.addEventListener('pointerenter', on); cta1.addEventListener('pointerleave', off);
        cta1.addEventListener('focus', on); cta1.addEventListener('blur', off);
      }
    }

    /* scroll entry: spring wave from the centre */
    function enter() {
      if (entered) return; entered = true;
      if (reduce || !g()) { faces.forEach(function (f) { f.pop = 1; }); draw(performance.now()); return; }
      var cx = W / 2, cy = H * 0.62, mx = 1;
      faces.forEach(function (f) { f.dd = Math.hypot((f.x - cx) * 0.8, f.y - cy); mx = Math.max(mx, f.dd); });
      faces.forEach(function (f) { g().to(f, { pop: 1, duration: 0.9, delay: f.dd / mx * 1.0 + Math.random() * 0.08, ease: 'back.out(2.6)' }); });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        vis = es[0].isIntersecting;
        if (vis) { if (!entered) setTimeout(enter, 120); run(); } else { stop(); setHover(-1); }
      }, { threshold: 0.12 }).observe(sec);
    } else { vis = true; enter(); run(); }

    sec.classList.add('has-crowd');
    var rt; new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(function () { var R = sec.getBoundingClientRect(); if (Math.round(R.width) !== W || Math.abs(Math.round(R.height) - H) > 2) layout(); }, 120); }).observe(sec);
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(layout);
    layout();
  })();
})();
