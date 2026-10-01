const fs=require('fs');
for(const p of process.argv.slice(2)){
 let html=fs.readFileSync(p,'utf8');
 html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,s=>/googletag|gtag\(|cloudflareinsights|intergient|ramp\.js/.test(s)?'':s);
 const customization=`<style>steam-wishlist,steam-widget,homepage-promos,purchase-nudge-modal,marketing-consent-toast,featured-stream,[data-page="page-item-store"],[data-page="page-inventory"],[data-page="page-clan"],a[href="/terms-of-service.html"],a[href="/privacy-policy.html"]{display:none!important}</style><script>
 const clean=()=>{document.querySelectorAll('iframe[src*="store.steampowered.com"]').forEach(el=>el.remove());document.querySelectorAll('game-mode-selector button').forEach(b=>{if(b.textContent.trim().toLowerCase()==='ranked')b.style.display='none'});document.querySelectorAll('[data-page="page-leaderboard"]').forEach(b=>{b.onclick=e=>{e.preventDefault();e.stopImmediatePropagation();location.href='/stats/'};});};
 new MutationObserver(clean).observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('DOMContentLoaded',clean);
 </script>`;
 html=html.replace('</head>',customization+'</head>');fs.writeFileSync(p,html);
}
