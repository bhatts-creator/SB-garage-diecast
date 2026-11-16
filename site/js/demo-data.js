/* Sample catalog used when config.js has no API_URL. Safe to delete once you go live. */
(function () {
  const DAY = 864e5;
  const now = Date.now();

  // Simple illustrated "photo" so the demo looks like a store, not a wall of broken images.
  function art(color, shape, bg) {
    const body = {
      coupe: 'M48 196l20-30q18-12 58-14l40-30q20-12 62-12l40 2q28 4 48 34l38 9q20 6 20 25v16H48z',
      box: 'M44 198V128q0-14 14-14h176q12 0 20 10l26 34 46 10q18 4 18 22v8z',
      wedge: 'M40 196l26-22 92-34q30-10 70-12l58 6q30 6 52 28l20 14q8 8 4 20H40z',
    }[shape];
    const glass = {
      coupe: 'M170 150l30-24q12-6 40-6l26 2q18 4 30 28z',
      box: 'M196 122h50q8 0 14 8l20 28h-84z',
      wedge: 'M176 142l40-14q18-4 48-2l24 4q16 4 26 16z',
    }[shape];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <defs><radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></radialGradient>
      <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <rect width="400" height="300" fill="url(#g)"/>
      <ellipse cx="200" cy="226" rx="160" ry="14" fill="#000" opacity=".35"/>
      <path d="${body}" fill="${color}"/><path d="${body}" fill="url(#b)"/>
      <path d="${glass}" fill="#0d1118" opacity=".85"/>
      <circle cx="122" cy="204" r="24" fill="#111"/><circle cx="122" cy="204" r="11" fill="#c9ccd3"/>
      <circle cx="298" cy="204" r="24" fill="#111"/><circle cx="298" cy="204" r="11" fill="#c9ccd3"/>
    </svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  const BG = [['#2b2f38', '#121418'], ['#30303a', '#141418'], ['#1f2a33', '#0e1317'], ['#33281f', '#15110d']];

  const raw = [
    ['HW-0001', 'Nissan Skyline GT-R (R34)', 'Hot Wheels', 'Nissan', 'HW J-Imports', '2024', 'Spectraflame Blue', 'Mint (carded)', 'Mainline, STH', 2499, 2999, 1, '#2f6bff', 'coupe', 1],
    ['HW-0002', '\'95 Mazda RX-7', 'Hot Wheels', 'Mazda', 'HW J-Imports', '2023', 'Red', 'Mint (carded)', 'Mainline', 199, null, 3, '#e23b2e', 'coupe', 2],
    ['MGT-0003', 'Porsche 911 GT3 RS', 'Mini GT', 'Porsche', 'Mini GT #612', '2024', 'Python Green', 'Boxed', 'Premium', 1299, null, 2, '#3fbf5a', 'wedge', 3],
    ['HW-0004', 'Honda Civic Type R (EK9)', 'Hot Wheels', 'Honda', 'Car Culture: Japan Historics 4', '2023', 'Championship White', 'Mint (carded)', 'Premium', 899, 999, 2, '#f1f1ee', 'coupe', 4],
    ['MGT-0005', 'LB-Silhouette Works GT 35GT-RR', 'Mini GT', 'Nissan', 'Mini GT #583', '2023', 'Raw Chrome', 'Boxed', 'Chase, Rare', 2999, null, 1, '#c7ccd4', 'wedge', 5],
    ['KH-0006', 'Datsun 510 Pro Street', 'Kaido House', 'Datsun', 'Kaido House #042', '2022', 'Orange', 'Boxed', 'Premium, Rare', 2199, null, 1, '#ff7a1f', 'coupe', 6],
    ['INNO-0007', 'Toyota Sprinter Trueno AE86', 'Inno64', 'Toyota', 'Inno64 IN64-AE86', '2023', 'Panda White/Black', 'Boxed', 'Premium', 1499, null, 2, '#e9e9e4', 'coupe', 7],
    ['HW-0008', 'Lamborghini Countach LPI 800-4', 'Hot Wheels', 'Lamborghini', 'HW Exotics', '2024', 'Silver', 'Mint (carded)', 'Mainline, TH', 699, null, 1, '#b8bcc4', 'wedge', 8],
    ['HW-0009', 'Ford Escort RS1600 & Fleet Flyer', 'Hot Wheels', 'Ford', 'Team Transport #61', '2024', 'Martini livery', 'Mint (carded)', 'Team Transport, Premium', 1799, null, 1, '#f3f3f3', 'box', 9],
    ['PR-0010', 'Toyota Land Cruiser FJ40', 'Pop Race', 'Toyota', 'Pop Race PR64', '2023', 'Sky Blue', 'Boxed', 'Premium', 1199, null, 2, '#6fb6e8', 'box', 10],
    ['HW-0011', 'BMW M3 (E30)', 'Hot Wheels', 'BMW', 'Silver Series', '2022', 'Zamac Silver', 'Mint (carded)', 'Silver Series', 549, null, 2, '#9ea4ad', 'coupe', 11],
    ['HW-0012', 'HW Exotics 5-Pack', 'Hot Wheels', 'Assorted', '5-Pack', '2024', 'Mixed', 'Mint (carded)', 'Pack of 5', 899, 999, 3, '#ffcc00', 'wedge', 12],
    ['MB-0013', 'Mercedes-Benz 300 SL', 'Matchbox', 'Mercedes-Benz', 'Matchbox Collectors', '2023', 'Silver', 'Mint (carded)', 'Premium', 649, null, 1, '#cfd3da', 'coupe', 13],
    ['MGT-0014', 'McLaren F1 GTR', 'Mini GT', 'McLaren', 'Mini GT #398', '2022', 'Gulf livery', 'Boxed', 'Rare', 1899, null, 0, '#7cc4e8', 'wedge', 14],
    ['HW-0015', 'Ferrari 250 GTO', 'Hot Wheels', 'Ferrari', 'Boulevard', '2021', 'Rosso Corsa', 'Carded – soft corners', 'Premium', 1099, null, 0, '#d01c1f', 'coupe', 15],
    ['KH-0016', 'Nissan Silvia S15', 'Kaido House', 'Nissan', 'Kaido House #078', '2024', 'Midnight Purple', 'Boxed', 'Premium', 2099, null, 1, '#5b3fa8', 'coupe', 16],
    ['HW-0017', '\'69 Chevrolet Camaro', 'Hot Wheels', 'Chevrolet', 'Muscle Mania', '2024', 'Green', 'Mint (carded)', 'Mainline, TH', 599, null, 1, '#3f8f4a', 'coupe', 17],
    ['HW-0018', 'Toyota GR Supra', 'Hot Wheels', 'Toyota', 'HW Turbo', '2024', 'Matte Black', 'Mint (carded)', 'Mainline', 179, null, 4, '#2a2d33', 'coupe', 18],
    ['INNO-0019', 'Mitsubishi Lancer Evolution VI', 'Inno64', 'Mitsubishi', 'Inno64 Rally', '2023', 'Red/White', 'Boxed', 'Premium', 1599, 1799, 1, '#e8423a', 'coupe', 19],
    ['TW-0020', 'Honda NSX Type R', 'Tarmac Works', 'Honda', 'Tarmac Global64', '2022', 'Yellow', 'Boxed', 'Premium, Rare', 1899, null, 1, '#ffd23a', 'wedge', 20],
    ['HW-0021', '\'67 Ford Mustang', 'Hot Wheels', 'Ford', 'RLC Exclusive', '2023', 'Spectraflame Gold', 'Boxed', 'RLC, Rare', 3499, null, 1, '#d8a73a', 'coupe', 21],
    ['HW-0022', 'Bugatti Chiron', 'Hot Wheels', 'Bugatti', 'HW Exotics', '2024', 'Blue', 'Loose', 'Mainline', 129, null, 2, '#2b56c9', 'wedge', 22],
    ['HW-0023', 'Audi Sport Quattro', 'Hot Wheels', 'Audi', 'Car Culture: Deutschland Design', '2023', 'White', 'Mint (carded)', 'Premium', 849, null, 1, '#efefef', 'coupe', 23],
    ['MGT-0024', 'Pagani Huayra Roadster', 'Mini GT', 'Pagani', 'Mini GT #377', '2023', 'Carbon/Orange', 'Boxed', 'Premium', 1349, null, 1, '#ff8a2a', 'wedge', 24],
  ];

  window.G64_DEMO_CATALOG = () => ({
    ok: true,
    settings: {
      storeName: "SB's Garage",
      tagline: '1:64 grails, straight off my shelf.',
      whatsappNumber: '919999999999',
      instagram: 'sbsgarage',
      announcement: 'DEMO MODE · add your Apps Script URL in config.js to go live',
      shippingNote: 'Shipping ₹80 flat, free above ₹1,500. Bubble-wrapped & boxed.',
      showSoldOut: 'Yes',
      newBadgeDays: '7',
    },
    items: raw.map((r, i) => ({
      id: r[0], name: r[1], brand: r[2], make: r[3], series: r[4], year: r[5], color: r[6], condition: r[7],
      tags: r[8].split(',').map(s => s.trim()), price: r[9], compareAt: r[10], qty: r[11],
      photos: [art(r[12], r[13], BG[i % 4]), art(r[12], r[13], BG[(i + 1) % 4]), art(r[12], r[13], BG[(i + 2) % 4])],
      notes: i % 3 === 0 ? 'Card is clean, blister uncracked. Ships in a protector.' : '',
      added: now - r[14] * 1.3 * DAY, n: i + 2,
    })),
  });
})();
