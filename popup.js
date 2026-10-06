var D={enabled:true,collapseHigh:false,showMedium:true,showGood:true,deepScan:false,hoverReasons:false,useStripe:false,trusted:[],dmFilter:true,dmBlockBots:true,dmBlockSellers:true,showStatus:true};
var KEYS=['enabled', 'showMedium', 'showGood', 'collapseHigh', 'deepScan', 'hoverReasons', 'showStatus', 'dmFilter', 'dmBlockBots', 'dmBlockSellers','useStripe'];
function $(i){return document.getElementById(i)}
chrome.storage.local.get(['cfg'],function(r){var c=Object.assign({},D,r.cfg||{});KEYS.forEach(function(k){$(k).checked=!!c[k]});$('trusted').value=c.trusted.join('\n')});
$('save').addEventListener('click',function(){var c={trusted:$('trusted').value.split('\n').map(function(s){return s.replace(/^u\//,'').trim().toLowerCase()}).filter(Boolean)};KEYS.forEach(function(k){c[k]=$(k).checked});chrome.storage.local.set({cfg:c},function(){$('save').textContent='Saved';setTimeout(function(){$('save').textContent='Save'},900)})});
