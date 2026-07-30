// Doha time dial — standalone, page-agnostic clock widget.
//
// Extracted from js/vendor.js on 2026-07-30. Previously this lived inside
// vendor.js's top-level IIFE, which starts with a hard requirement for a
// signed-in vendor session (redirects to vendor-login.html otherwise).
// When admin.html started loading vendor.js just to get this clock, every
// admin who wasn't ALSO independently logged in as a vendor got redirected
// away before they could even see the admin login form. This file has no
// session dependency at all — safe to load on any page.
//
// Requires js/store.js to be loaded first (for Store.SURPLUS_WINDOWS).
// Degrades gracefully: if the expected elements aren't on the page, or
// don't have the expected shape (e.g. admin.html's #vendorDialStatus is
// an empty <p>, not one with a text node), it just skips that update
// instead of throwing.

(function(){
  const dialSvg = document.getElementById('vendorDialSvg');
  const clockText = document.getElementById('vendorClockText');
  const dialStatus = document.getElementById('vendorDialStatus');
  const dialSub = document.getElementById('vendorDialSub');
  if(!clockText) return;

  const SURPLUS_WINDOWS = Store.SURPLUS_WINDOWS;

  function angleForHour(h){ return (h / 12) * 360; }
  function polar(cx, cy, r, angleDeg){
    const a = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }
  function arcPath(cx, cy, r, startAngle, endAngle){
    const s = polar(cx, cy, r, startAngle);
    const e = polar(cx, cy, r, endAngle);
    const largeArc = (endAngle - startAngle) % 360 > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  }

  function buildDial(){
    const cx = 120, cy = 120, r = 96;
    let svg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(246,241,227,0.18)" stroke-width="1.5"/>`;
    for(let i=0;i<12;i++){
      const ang = i * 30;
      const p1 = polar(cx, cy, r, ang);
      const p2 = polar(cx, cy, r - (i%3===0?10:5), ang);
      svg += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="rgba(246,241,227,0.35)" stroke-width="${i%3===0?2:1}"/>`;
    }
    SURPLUS_WINDOWS.forEach(w => {
      const startH = w.startHour % 12;
      const endH = w.endHour % 12;
      svg += `<path d="${arcPath(cx, cy, r, angleForHour(startH), angleForHour(endH))}"
        fill="none" stroke="#2F6E67" stroke-width="6" stroke-linecap="round" opacity="0.85"/>`;
    });
    svg += `<circle cx="${cx}" cy="${cy}" r="4" fill="#E8A33D"/>`;
    dialSvg.setAttribute('viewBox', '0 0 240 240');
    dialSvg.innerHTML = svg;
  }
  function updateHands(){
    const now = new Date();
    const h12 = now.getHours() % 12 + now.getMinutes()/60;
    const m = now.getMinutes() + now.getSeconds()/60;
    const cx = 120, cy = 120;

    const hourTip = polar(cx, cy, 52, angleForHour(h12));
    const minTip = polar(cx, cy, 76, (m/60) * 360);
    const secTip = polar(cx, cy, 84, (now.getSeconds()/60) * 360);

    if(dialSvg){
      dialSvg.querySelectorAll('.hand').forEach(el => el.remove());

      const hourLine = document.createElementNS('http://www.w3.org/2000/svg','line');
      hourLine.setAttribute('class','hand');
      hourLine.setAttribute('x1', cx); hourLine.setAttribute('y1', cy);
      hourLine.setAttribute('x2', hourTip.x); hourLine.setAttribute('y2', hourTip.y);
      hourLine.setAttribute('stroke', '#F6F1E3'); hourLine.setAttribute('stroke-width', '4'); hourLine.setAttribute('stroke-linecap','round');
      dialSvg.appendChild(hourLine);

      const minLine = document.createElementNS('http://www.w3.org/2000/svg','line');
      minLine.setAttribute('class','hand');
      minLine.setAttribute('x1', cx); minLine.setAttribute('y1', cy);
      minLine.setAttribute('x2', minTip.x); minLine.setAttribute('y2', minTip.y);
      minLine.setAttribute('stroke', '#E8A33D'); minLine.setAttribute('stroke-width', '2.5'); minLine.setAttribute('stroke-linecap','round');
      dialSvg.appendChild(minLine);

      const secLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      secLine.setAttribute('class', 'hand');
      secLine.setAttribute('x1', cx); secLine.setAttribute('y1', cy);
      secLine.setAttribute('x2', secTip.x); secLine.setAttribute('y2', secTip.y);
      secLine.setAttribute('stroke', '#ec4e33'); secLine.setAttribute('stroke-width', '1.5'); secLine.setAttribute('stroke-linecap', 'round');
      dialSvg.appendChild(secLine);
    }

    clockText.textContent = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });

    // Defensive: admin.html has these elements but as empty tags with no
    // text-node child (they're hidden there anyway), unlike the vendor
    // dashboard's version. Skip gracefully instead of throwing on
    // dialStatus.firstChild being null.
    if(dialStatus && dialStatus.firstChild){
      const hourNow = now.getHours() + now.getMinutes()/60;
      const inWindow = SURPLUS_WINDOWS.find(w => hourNow >= w.startHour && hourNow < w.endHour);
      if(inWindow){
        dialStatus.firstChild.textContent = inWindow.label + ' is live';
        if(dialSub) dialSub.textContent = 'Good time to post';
      } else {
        const next = SURPLUS_WINDOWS.find(w => w.startHour > hourNow) || SURPLUS_WINDOWS[0];
        const nextH = Math.floor(next.startHour);
        const nextM = Math.round((next.startHour % 1) * 60);
        const label = new Date().setHours(nextH, nextM, 0, 0);
        dialStatus.firstChild.textContent = 'Next window at ' + new Date(label).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
        if(dialSub) dialSub.textContent = '';
      }
    }
  }

  if(dialSvg){
    buildDial();
  }
  updateHands();
  setInterval(updateHands, 1000);
})();