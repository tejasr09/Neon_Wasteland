(() => {
    "use strict";
    const canvas = document.querySelector("#game");
    const ctx = canvas.getContext("2d");
    const shell = document.querySelector(".game-shell");
    const byId = id => document.getElementById(id);
    const overlays = ["startOverlay","pauseOverlay","settingsOverlay","upgradeOverlay","deadOverlay"].map(byId);
    const defaults = {left:"KeyA",right:"KeyD",jump:"Space",shoot:"Mouse0",ability:"KeyQ",dash:"ShiftLeft"};
    const labels = {left:"Move left",right:"Move right",jump:"Jump",shoot:"Fire weapon",ability:"Cyberpulse",dash:"Cyber-dash"};
    let binds = {...defaults}, captureBind = null, playing = false, paused = true, lastTime = 0, worldTime = 0;
    let width = 0, height = 0, scale = 1, cameraX = 0, kills = 0, enemies = [], bullets = [], particles = [], pickups = [], platforms = [];
    let keys = new Set(), mouse = {x:0,y:0,down:false}, toastTimer = 0, shake = 0, audioContext = null,animationTime=0;
    const difficulty = {street:{enemyHealth:1,damage:5,spawn:7.5},merc:{enemyHealth:1.4,damage:9,spawn:6.3},legend:{enemyHealth:1.9,damage:14,spawn:5.2}};
    const WORLD_LENGTH=21600,DISTRICT_LENGTH=3600;
    const districts=[
      {name:"NEON OUTSKIRTS",sky:["#090d1e","#17152d","#271530"],ground:["#25233a","#191d2e","#111827"],glow:"#52f6ef"},
      {name:"CHROME DESERT",sky:["#171020","#33202a","#49302b"],ground:["#49303a","#302531","#1b1b29"],glow:"#ffb35c"},
      {name:"GHOST MARKET",sky:["#081918","#102c2d","#172b33"],ground:["#18383a","#15292f","#101b27"],glow:"#52f6ef"},
      {name:"REDLINE DISTRICT",sky:["#190b18","#351327","#46182a"],ground:["#442039","#291b30","#191626"],glow:"#ff4d77"},
      {name:"SKYBRIDGE",sky:["#0c1328","#18284a","#26385a"],ground:["#233756","#19263f","#101b30"],glow:"#9e77ff"},
      {name:"CORPO CORE",sky:["#100b20","#24133c","#381c3a"],ground:["#392044","#241b37","#141427"],glow:"#ff4d9d"}
    ];
    const skyTraffic=Array.from({length:9},(_,index)=>({x:(index*173+97)%1190,y:116+(index*67)%220,speed:14+(index*13)%25,direction:index%3===0?-1:1,color:index%2?"#52f6ef":"#ff4d9d"}));
    const weaponCatalog=[
      {id:"mono",name:"Mono-blade",category:"melee",unlock:0,damage:2,cooldown:.42,range:70,ammo:Infinity,reload:0,color:"#52f6ef"},
      {id:"katana",name:"Thermal katana",category:"melee",unlock:35,damage:3.5,cooldown:.58,range:92,ammo:Infinity,reload:0,color:"#ff4d9d"},
      {id:"pistol",name:"Street pistol",category:"short",unlock:0,damage:1,cooldown:.32,mag:12,reload:1.35,speed:720,spread:.025,pellets:1,color:"#ffc866"},
      {id:"smg",name:"Buzzsaw SMG",category:"short",unlock:28,damage:.7,cooldown:.105,mag:32,reload:1.65,speed:680,spread:.09,pellets:1,color:"#ff9b57"},
      {id:"scatter",name:"Quad shotgun",category:"short",unlock:72,damage:.68,cooldown:.72,mag:6,reload:1.8,speed:570,spread:.28,pellets:5,color:"#ff557c"},
      {id:"rifle",name:"Wasteland rifle",category:"long",unlock:0,damage:1.35,cooldown:.48,mag:14,reload:1.55,speed:930,spread:.018,pellets:1,color:"#a9c9ff"},
      {id:"rail",name:"Rail lance",category:"long",unlock:52,damage:3.2,cooldown:.94,mag:5,reload:2.1,speed:1250,spread:0,pellets:1,color:"#d084ff"},
      {id:"burst",name:"Tri-burst",category:"long",unlock:105,damage:.92,cooldown:.56,mag:18,reload:1.7,speed:850,spread:.075,pellets:3,color:"#72ffe0"}
    ];
    const upgradeCatalog=[
      {id:"damage",name:"Overclocked rounds",description:"+20% damage per rank.",base:30,max:4},
      {id:"reload",name:"Quick-change mag",description:"Reload and fire 15% faster per rank.",base:25,max:4},
      {id:"movement",name:"Kinetic actuators",description:"+12% run speed per rank.",base:25,max:4},
      {id:"jump",name:"Jump servos",description:"Higher jumps and stronger air control.",base:22,max:3},
      {id:"vitality",name:"Reinforced dermal weave",description:"+20 maximum health; restore 20.",base:35,max:3},
      {id:"dash",name:"Reflex booster",description:"Dash recharges faster and costs less energy.",base:28,max:3}
    ];
    let currentLevel=0,spawnTimer=0,lastBossLevel=0,frontierReached=false,firstSpawn=true,runSeconds=0,xp=0,totalXp=0,checkpointX=200,checkpointIds=new Set(),upgradeRanks={damage:0,reload:0,movement:0,jump:0,vitality:0,dash:0},activeCategory="short",activeWeaponId="pistol",weaponAmmo={},reloadTimer=0,checkpointObjects=[],jumpBuffer=0,coyoteTime=0,wasPausedForUpgrade=true,wasPausedForSettings=true;
    const player = {x:200,y:0,vx:0,vy:0,w:25,h:45,health:100,maxHealth:100,energy:100,face:1,onGround:false,fireCd:0,pulseCd:0,dashCd:0,dashTimer:0,invulnerable:0};
    const terrainY = x => {
      const wave=Math.sin(x*.0032)*34+Math.sin(x*.0081+1.3)*18+Math.sin(x*.0011+2)*38;
      const ridge=Math.sin(x*.00042)*22;
      return Math.floor(height*.71+wave+ridge);
    };
    const fmtKey = code => code==="Mouse0"?"CLICK":code==="Space"?"SPACE":code==="ShiftLeft"||code==="ShiftRight"?"SHIFT":code.startsWith("Key")?code.slice(3):code.startsWith("Arrow")?code.slice(5).toUpperCase():code.replace("Digit","");
    const currentDifficulty=()=>difficulty[byId("difficulty").value]||difficulty.street;
    function resize(){
      const rect=shell.getBoundingClientRect(); scale=Math.min(window.devicePixelRatio||1,2);
      width=rect.width;height=rect.height;canvas.width=Math.floor(width*scale);canvas.height=Math.floor(height*scale);
      ctx.setTransform(scale,0,0,scale,0,0);
      if(player.y===0) player.y=terrainY(player.x)-player.h;
      if(mouse.x===0&&mouse.y===0){mouse.x=Math.min(width-30,width*.72);mouse.y=player.y+player.h/2;}
    }
    window.addEventListener("resize",resize); resize();
    function setOverlay(name){overlays.forEach(el=>el.classList.add("hidden"));if(name)byId(name).classList.remove("hidden");shell.classList.toggle("playing",playing&&!paused&&!name);}
    function showToast(message){const el=byId("toast");el.textContent=message;el.classList.add("show");toastTimer=1.8;}
    function sound(frequency=300,duration=.07,type="square",volume=.08){
      const level=Number(byId("volume").value)/100;if(level===0)return;
      try{audioContext=audioContext||new(window.AudioContext||window.webkitAudioContext)();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=type;osc.frequency.value=frequency;gain.gain.setValueAtTime(Math.min(volume*level,.14),audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration);}catch(error){console.warn("Audio playback unavailable:",error);}
    }
    function updateLabels(){
      byId("hintMove").textContent=`${fmtKey(binds.left)} / ${fmtKey(binds.right)}`;
      byId("hintShoot").textContent=binds.shoot==="Mouse0"?"CLICK":fmtKey(binds.shoot);
      byId("hintAbility").textContent=fmtKey(binds.ability);
      byId("keybinds").innerHTML=Object.entries(labels).map(([id,label])=>`<div class="key-row"><span>${label}</span><button type="button" data-bind="${id}">${fmtKey(binds[id])}</button></div>`).join("");
    }
    function savePreferences(){localStorage.setItem("neonWastelandSettings",JSON.stringify({binds,difficulty:byId("difficulty").value,volume:byId("volume").value,glow:byId("glow").value,aimAssist:byId("aimAssist").value}));}
    function loadPreferences(){
      try{const saved=JSON.parse(localStorage.getItem("neonWastelandSettings")||"{}");if(saved.binds)for(const id of Object.keys(defaults))if(typeof saved.binds[id]==="string")binds[id]=saved.binds[id];if(saved.difficulty&&difficulty[saved.difficulty])byId("difficulty").value=saved.difficulty;if(saved.volume)byId("volume").value=saved.volume;if(saved.glow)byId("glow").value=saved.glow;if(saved.aimAssist)byId("aimAssist").value=saved.aimAssist;}catch(error){console.warn("Saved settings could not be loaded:",error);}
      byId("volumeValue").textContent=`${byId("volume").value}%`;byId("glowValue").textContent=`${byId("glow").value}%`;updateLabels();
    }
    function currentWeapon(){return weaponCatalog.find(weapon=>weapon.id===activeWeaponId)||weaponCatalog.find(weapon=>weapon.id==="pistol");}
    function weaponUnlocked(weapon){return runSeconds>=weapon.unlock;}
    function syncWeaponCategory(category,cycle=false){
      activeCategory=category;
      const available=weaponCatalog.filter(weapon=>weapon.category===category&&weaponUnlocked(weapon));
      const currentIndex=available.findIndex(weapon=>weapon.id===activeWeaponId);
      const chosen=available[cycle?(currentIndex+1)%available.length:available.length-1]||available[0];
      if(chosen){activeWeaponId=chosen.id;if(chosen.mag&&weaponAmmo[chosen.id]===undefined)weaponAmmo[chosen.id]=chosen.mag;reloadTimer=0;showToast(`${chosen.name.toUpperCase()} // EQUIPPED`);}
      updateHud();
    }
    function saveRun(){
      const data={xp,totalXp,checkpointX,checkpointIds:[...checkpointIds],upgradeRanks,weaponAmmo,runSeconds,kills,activeCategory,activeWeaponId};
      try{localStorage.setItem("neonWastelandRun",JSON.stringify(data));}catch(error){console.warn("Run progress could not be saved:",error);}
    }
    function loadRun(){
      try{const data=JSON.parse(localStorage.getItem("neonWastelandRun")||"null");if(!data)return false;
        xp=Math.max(0,Number(data.xp)||0);totalXp=Math.max(0,Number(data.totalXp)||0);checkpointX=Math.max(200,Math.min(WORLD_LENGTH-100,Number(data.checkpointX)||200));
        checkpointIds=new Set(Array.isArray(data.checkpointIds)?data.checkpointIds:[]);runSeconds=Math.max(0,Number(data.runSeconds)||0);kills=Math.max(0,Number(data.kills)||0);
        for(const point of checkpointObjects)point.active=checkpointIds.has(point.id);
        if(data.upgradeRanks)for(const upgrade of upgradeCatalog)upgradeRanks[upgrade.id]=Math.max(0,Math.min(upgrade.max,Number(data.upgradeRanks[upgrade.id])||0));
        if(data.weaponAmmo)weaponAmmo=data.weaponAmmo;
        if(weaponCatalog.some(weapon=>weapon.id===data.activeWeaponId&&weaponUnlocked(weapon))){activeWeaponId=data.activeWeaponId;activeCategory=currentWeapon().category;}
        applyUpgrades();return true;
      }catch(error){console.warn("Saved run could not be loaded:",error);return false;}
    }
    function applyUpgrades(){
      player.maxHealth=100+(upgradeRanks.vitality||0)*20;player.health=Math.min(player.maxHealth,player.health);
      player.moveMultiplier=1+(upgradeRanks.movement||0)*.12;player.jumpMultiplier=1+(upgradeRanks.jump||0)*.12;
      player.reloadMultiplier=Math.max(.48,1-(upgradeRanks.reload||0)*.15);
      player.dashMultiplier=Math.max(.55,1-(upgradeRanks.dash||0)*.13);
    }
    function gainXp(amount){
      xp+=amount;totalXp+=amount;saveRun();showToast(`+${amount} XP // COMBAT DATA ACQUIRED`);updateHud();
    }
    function openUpgrades(){
      if(!byId("settingsOverlay").classList.contains("hidden"))return;
      wasPausedForUpgrade=paused;paused=true;renderUpgrades();overlays.forEach(el=>el.classList.add("hidden"));byId("upgradeOverlay").classList.remove("hidden");shell.classList.remove("playing");
    }
    function closeUpgrades(){
      byId("upgradeOverlay").classList.add("hidden");
      if(playing&&!wasPausedForUpgrade){paused=false;setOverlay(null);}
      else if(playing){paused=true;setOverlay("pauseOverlay");}
      else setOverlay("startOverlay");
    }
    function renderUpgrades(){
      byId("upgradeXp").textContent=`${xp} XP`;
      byId("upgradeGrid").innerHTML=upgradeCatalog.map(item=>{
        const rank=upgradeRanks[item.id]||0,cost=item.base*(rank+1),maxed=rank>=item.max;
        return `<article class="upgrade-card"><h3>${item.name} · ${rank}/${item.max}</h3><p>${item.description}</p><button type="button" data-upgrade="${item.id}" ${maxed||xp<cost?"disabled":""}>${maxed?"MAX RANK":`INSTALL · ${cost} XP`}</button></article>`;
      }).join("");
    }
    function buyUpgrade(id){
      const item=upgradeCatalog.find(upgrade=>upgrade.id===id);if(!item)return;
      const rank=upgradeRanks[id]||0,cost=item.base*(rank+1);if(rank>=item.max||xp<cost)return;
      xp-=cost;upgradeRanks[id]=rank+1;applyUpgrades();if(id==="vitality")player.health=Math.min(player.maxHealth,player.health+20);saveRun();renderUpgrades();updateHud();sound(680,.16,"sine",.06);
      showToast(`${item.name.toUpperCase()} // RANK ${rank+1} INSTALLED`);
    }
    function openSettings(){wasPausedForSettings=paused;if(playing)paused=true;overlays.forEach(el=>el.classList.add("hidden"));byId("settingsOverlay").classList.remove("hidden");shell.classList.remove("playing");}
    function closeSettings(){savePreferences();byId("settingsOverlay").classList.add("hidden");if(!playing)setOverlay("startOverlay");else if(wasPausedForSettings){paused=true;setOverlay("pauseOverlay");}else{paused=false;setOverlay(null);}}
    function resetGame(){
      keys.clear();mouse.down=false;
      player.x=200;player.y=terrainY(player.x)-player.h;player.vx=0;player.vy=0;player.health=100;player.energy=100;player.face=1;player.fireCd=player.pulseCd=player.dashCd=player.dashTimer=player.invulnerable=0;
      xp=0;totalXp=0;runSeconds=0;kills=0;checkpointX=200;checkpointIds=new Set();upgradeRanks={damage:0,reload:0,movement:0,jump:0,vitality:0,dash:0};activeCategory="short";activeWeaponId="pistol";weaponAmmo={pistol:12};applyUpgrades();
      cameraX=0;enemies=[];bullets=[];particles=[];pickups=[];worldTime=0;currentLevel=0;lastBossLevel=0;frontierReached=false;firstSpawn=true;spawnTimer=3.2;platforms=createPlatforms();checkpointObjects=createCheckpoints();
      byId("worldLabel").textContent=`LEVEL 01 // ${districts[0].name}`;
      byId("killCount").textContent="ELIMINATED 00";updateHud();
    }
    function startGame(){
      const hasSave=Boolean(localStorage.getItem("neonWastelandRun"));
      resetGame();
      if(hasSave&&loadRun()){respawnAtCheckpoint(false);showToast("RUN RESTORED // CHECKPOINT DATA LOADED");}
      else{player.invulnerable=1.8;playing=true;paused=false;setOverlay(null);sound(420,.16,"sawtooth",.05);showToast("SIGNAL RESTORED · GOOD HUNT, RUNNER");}
    }
    function createPlatforms(){
      const result=[];
      const heights=[72,106,136,94,62,116,148,101,66,124,151,96,64,110,140,90,58];
      for(let zone=0;zone<districts.length;zone++){
        const start=zone*DISTRICT_LENGTH+250;
        for(let step=0;step<heights.length;step++){const x=start+step*170;result.push({x,w:148+(step%3)*10,y:terrainY(x+70)-heights[step],step});}
      }
      return result;
    }
    function createCheckpoints(){return districts.map((area,index)=>({id:index+1,x:index*DISTRICT_LENGTH+DISTRICT_LENGTH*.52,y:0,name:area.name,active:false}));}
    function respawnAtCheckpoint(showMessage=true){
      player.x=checkpointX;player.y=terrainY(player.x)-player.h;player.vx=0;player.vy=0;player.health=player.maxHealth;player.energy=100;player.invulnerable=2;player.fireCd=0;player.pulseCd=0;player.dashCd=0;player.dashTimer=0;reloadTimer=0;mouse.down=false;keys.clear();
      cameraX=Math.max(0,player.x-width*.38);bullets=[];enemies=[];particles=[];pickups=[];firstSpawn=true;spawnTimer=1;
      const level=Math.min(districts.length-1,Math.floor(player.x/DISTRICT_LENGTH));currentLevel=level;lastBossLevel=level;
      byId("worldLabel").textContent=`LEVEL ${String(level+1).padStart(2,"0")} // ${districts[level].name}`;
      playing=true;paused=false;setOverlay(null);updateHud();if(showMessage)showToast(`CHECKPOINT RESTORED // ${districts[level].name}`);
    }
    function activateCheckpoints(){
      for(const point of checkpointObjects){
        point.active=checkpointIds.has(point.id);
        if(!point.active&&Math.abs(player.x-point.x)<52&&Math.abs((player.y+player.h)-terrainY(player.x))<115){
          point.active=true;checkpointIds.add(point.id);checkpointX=point.x;player.health=player.maxHealth;player.energy=100;
          saveRun();sound(620,.3,"sine",.08);showToast(`SAVE POINT SECURED // ${point.name}`);
        }
      }
    }
    function spawnEnemy(x,forcedKind=null){
      const level=Math.min(6,Math.floor(x/DISTRICT_LENGTH)+1),mod=currentDifficulty();
      const roll=Math.random();
      const kind=forcedKind||(level>=3&&roll<.10?"heavy":level>=2&&roll<.35?"long":roll<.63?"melee":"short");
      const types={
        melee:{w:27,h:42,hp:3,range:34,speed:112,fireRate:0,damage:9,color:"#ff557c"},
        short:{w:25,h:39,hp:3,range:245,speed:52,fireRate:1.8,damage:5,color:"#ff9b57"},
        long:{w:25,h:42,hp:4,range:610,speed:25,fireRate:2.25,damage:4,color:"#d084ff"},
        heavy:{w:48,h:68,hp:20,range:480,speed:20,fireRate:1.55,damage:10,color:"#ff4d9d"}
      };
      const type=types[kind],threat=1+(level-1)*.18;
      const hp=type.hp*mod.enemyHealth*threat;
      const y=terrainY(x);
      enemies.push({x,y:y-type.h,w:type.w,h:type.h,hp,maxHp:hp,vx:0,face:-1,anchor:x,fireCd:1.1+Math.random(),flash:0,kind,phase:Math.random()*6,range:type.range,speed:type.speed*(1+(level-1)*.1),fireRate:type.fireRate>0?Math.max(.58,type.fireRate-(level-1)*.11):0,damage:type.damage*mod.damage/8*(1+(level-1)*.1),hitTimer:0,attackTimer:0,windup:0});
    }
    function spawnParticles(x,y,color,count=8,power=120){
      for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,speed=Math.random()*power;particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-Math.random()*50,life:.25+Math.random()*.5,max:.75,color,size:2+Math.random()*3});}
    }
    function updateHud(){
      const hp=Math.max(0,player.health);byId("healthBar").style.width=`${100*hp/player.maxHealth}%`;byId("healthText").textContent=`${Math.ceil(hp)} / ${player.maxHealth}`;
      byId("energyBar").style.width=`${player.energy}%`;byId("energyText").textContent=`${Math.floor(player.energy)}%`;
      byId("killCount").textContent=`ELIMINATED ${String(kills).padStart(2,"0")}`;
      byId("xpText").textContent=`XP ${xp}`;byId("levelText").textContent=`LV ${Math.floor(totalXp/100)+1}`;
      byId("xpBar").style.width=`${totalXp%100}%`;
      const weapon=currentWeapon(),ammo=weapon.mag?`${weaponAmmo[weapon.id]??weapon.mag}/${weapon.mag}`:"∞";
      byId("weaponHud").textContent=`${weapon.name.toUpperCase()} · ${reloadTimer>0?"RELOADING":ammo} · [R] RELOAD · [1/2/3] WEAPON CLASS`;
    }
    function aimTarget(){return {x:mouse.x+cameraX,y:mouse.y};}
    function reloadWeapon(){
      const weapon=currentWeapon();if(!weapon.mag||reloadTimer>0||weaponAmmo[weapon.id]>=weapon.mag)return;
      reloadTimer=weapon.reload*player.reloadMultiplier;showToast(`RELOADING // ${weapon.name.toUpperCase()}`);
    }
    function meleeAttack(weapon,angle){
      const reach=weapon.range,halfArc=.92;let hits=0;player.meleeFx=.2;player.meleeAngle=angle;
      for(const enemy of enemies){
        const dx=enemy.x+enemy.w/2-(player.x+player.w/2),dy=enemy.y+enemy.h/2-(player.y+player.h*.48),distance=Math.hypot(dx,dy);
        const enemyAngle=Math.atan2(dy,dx),difference=Math.atan2(Math.sin(enemyAngle-angle),Math.cos(enemyAngle-angle));
        if(distance<=reach+enemy.w/2&&Math.abs(difference)<=halfArc){enemy.hp-=weapon.damage*(1+(upgradeRanks.damage||0)*.2);enemy.hitTimer=2.4;enemy.flash=.18;enemy.vx+=Math.sign(dx)*180;spawnParticles(enemy.x+enemy.w/2,enemy.y+enemy.h/2,weapon.color,7,120);hits++;}
      }
      if(hits)sound(210,.13,"sawtooth",.06);else sound(310,.07,"triangle",.035);
    }
    function fire(){
      if(player.fireCd>0||reloadTimer>0||!playing||paused)return;
      const weapon=currentWeapon(),target=aimTarget();let dx=target.x-(player.x+player.w/2),dy=target.y-(player.y+player.h*.48);
      if(mouse.x===0&&mouse.y===0){dx=player.face;dy=-.08;}
      if(Math.abs(dx)>6)player.face=Math.sign(dx);
      const angle=Math.atan2(dy,dx),fireRate=weapon.cooldown*player.reloadMultiplier;
      player.fireCd=fireRate;
      if(weapon.category==="melee"){meleeAttack(weapon,angle);return;}
      if(weaponAmmo[weapon.id]===undefined)weaponAmmo[weapon.id]=weapon.mag;
      if(weaponAmmo[weapon.id]<=0){reloadWeapon();return;}
      weaponAmmo[weapon.id]--;
      for(let i=0;i<weapon.pellets;i++){const shotAngle=angle+(Math.random()-.5)*weapon.spread;bullets.push({x:player.x+player.w/2+Math.cos(shotAngle)*20,y:player.y+player.h*.48+Math.sin(shotAngle)*20,vx:Math.cos(shotAngle)*weapon.speed,vy:Math.sin(shotAngle)*weapon.speed,r:weapon.id==="rail"?5:3,life:1.65,damage:weapon.damage*(1+(upgradeRanks.damage||0)*.2),enemy:false,color:weapon.color});}
      spawnParticles(player.x+player.w/2+Math.cos(angle)*24,player.y+player.h*.48+Math.sin(angle)*24,weapon.color,3,55);sound(195+Math.random()*70,.055,"square",.055);
      if(weaponAmmo[weapon.id]===0)reloadWeapon();
    }
    function pulse(){
      if(player.energy<32||player.pulseCd>0){showToast(player.energy<32?"CYBER-ENERGY TOO LOW":"CYBERPULSE RECHARGING");return;}
      player.energy-=32;player.pulseCd=5.5;shake=9;spawnParticles(player.x+player.w/2,player.y+player.h/2,"#52f6ef",36,260);
      for(const e of enemies){const d=Math.hypot(e.x-player.x,e.y-player.y);if(d<210){e.hp-=2*(1+(upgradeRanks.damage||0)*.2);e.hitTimer=2.4;e.flash=.16;e.vx+=Math.sign(e.x-player.x)*170;}}
      sound(105,.42,"sawtooth",.1);showToast("CYBERPULSE // HOSTILES DISRUPTED");
    }
    function dash(){
      const energyCost=Math.max(8,16-(upgradeRanks.dash||0)*2);
      if(player.dashCd>0||player.energy<energyCost){if(player.dashCd<=0)showToast("CYBER-ENERGY TOO LOW");return;}
      player.energy-=energyCost;player.dashCd=1.1*player.dashMultiplier;player.dashTimer=.16;player.invulnerable=.38;player.vx=player.face*570;player.vy=Math.min(player.vy,0);
      spawnParticles(player.x+player.w/2,player.y+player.h/2,"#ff4d9d",13,160);sound(540,.1,"sawtooth",.05);
    }
    function keyDown(e){
      if(captureBind){if(e.code==="Escape"){captureBind=null;updateLabels();return;}if(Object.entries(binds).some(([id,code])=>id!==captureBind&&code===e.code)){showToast("THAT KEY IS ALREADY IN USE");return;}binds[captureBind]=e.code;captureBind=null;updateLabels();savePreferences();return;}
      if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();
      if(e.code==="Escape"&&!byId("upgradeOverlay").classList.contains("hidden")){closeUpgrades();return;}
      keys.add(e.code);
      if(e.code==="Escape"){if(!byId("settingsOverlay").classList.contains("hidden")){closeSettings();return;}if(!byId("deadOverlay").classList.contains("hidden"))return;if(!playing){openSettings();return;}paused=!paused;setOverlay(paused?"pauseOverlay":null);return;}
      if(!playing||paused)return;
      if(e.code===binds.jump){jumpBuffer=.14;}
      if(e.code===binds.ability)pulse();
      if(e.code===binds.dash)dash();
      if(e.code==="KeyR")reloadWeapon();
      if(e.code==="KeyU")openUpgrades();
      if(e.code==="Digit1")syncWeaponCategory("melee",true);
      if(e.code==="Digit2")syncWeaponCategory("short",true);
      if(e.code==="Digit3")syncWeaponCategory("long",true);
      if(e.code===binds.shoot)fire();
    }
    window.addEventListener("keydown",keyDown,true);
    window.addEventListener("keyup",e=>{keys.delete(e.code);if(e.code===binds.jump&&player.vy<0)player.vy*=.48;});
    canvas.addEventListener("pointermove",e=>{const r=canvas.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;if(playing&&!paused)player.face=Math.sign(mouse.x+cameraX-(player.x+player.w/2))||player.face;});
    canvas.addEventListener("pointerdown",e=>{if(e.button===0){mouse.down=true;if(binds.shoot==="Mouse0")fire();}});
    window.addEventListener("pointerup",()=>mouse.down=false);
    window.addEventListener("pointerdown",e=>{if(captureBind==="shoot"&&e.button===0){e.preventDefault();e.stopImmediatePropagation();binds.shoot="Mouse0";captureBind=null;updateLabels();savePreferences();}},true);
    window.addEventListener("blur",()=>keys.clear());
    byId("keybinds").addEventListener("click",e=>{const button=e.target.closest("button[data-bind]");if(!button)return;captureBind=button.dataset.bind;button.textContent="PRESS KEY";button.classList.add("listening");});
    byId("upgradeGrid").addEventListener("click",e=>{const button=e.target.closest("button[data-upgrade]");if(button)buyUpgrade(button.dataset.upgrade);});
    byId("startButton").onclick=startGame;byId("retryButton").onclick=()=>respawnAtCheckpoint();byId("resumeButton").onclick=()=>{paused=false;setOverlay(null);};
    byId("upgradeButton").onclick=openUpgrades;byId("pauseUpgrades").onclick=openUpgrades;byId("closeUpgrades").onclick=closeUpgrades;
    byId("settingsButton").onclick=openSettings;byId("startSettings").onclick=openSettings;byId("pauseSettings").onclick=openSettings;byId("closeSettings").onclick=closeSettings;
    byId("resetSettings").onclick=()=>{binds={...defaults};byId("difficulty").value="street";byId("volume").value="35";byId("glow").value="75";byId("aimAssist").value="on";byId("volumeValue").textContent="35%";byId("glowValue").textContent="75%";updateLabels();savePreferences();};
    byId("volume").oninput=()=>{byId("volumeValue").textContent=`${byId("volume").value}%`;savePreferences();};
    byId("glow").oninput=()=>{byId("glowValue").textContent=`${byId("glow").value}%`;savePreferences();};
    byId("difficulty").onchange=savePreferences;byId("aimAssist").onchange=savePreferences;
    loadPreferences();
    if(localStorage.getItem("neonWastelandRun"))byId("startButton").textContent="CONTINUE FROM SAVE POINT  →";

    function update(dt){
      if(!playing||paused)return;worldTime+=dt;
      const previousRunSeconds=runSeconds;runSeconds+=dt;
      for(const weapon of weaponCatalog)if(weapon.unlock>0&&previousRunSeconds<weapon.unlock&&runSeconds>=weapon.unlock)showToast(`${weapon.name.toUpperCase()} // NEW WEAPON UNLOCKED · ${weapon.category.toUpperCase()}`);
      const left=keys.has(binds.left),right=keys.has(binds.right),accel=1450,previousBottom=player.y+player.h;
      if(left)player.vx-=accel*dt;if(right)player.vx+=accel*dt;
      if(!left&&!right)player.vx*=Math.pow(.0008,dt);player.dashTimer=Math.max(0,player.dashTimer-dt);const maxPlayerSpeed=player.dashTimer>0?570:235*player.moveMultiplier;player.vx=Math.max(-maxPlayerSpeed,Math.min(maxPlayerSpeed,player.vx));
      player.x=Math.max(18,Math.min(WORLD_LENGTH-player.w,player.x+player.vx*dt));
      if(player.onGround)coyoteTime=.12;else coyoteTime=Math.max(0,coyoteTime-dt);
      jumpBuffer=Math.max(0,jumpBuffer-dt);
      if(jumpBuffer>0&&coyoteTime>0){player.vy=-510*player.jumpMultiplier;player.onGround=false;coyoteTime=0;jumpBuffer=0;sound(300,.08,"triangle",.03);}
      player.vy=Math.min(900,player.vy+1350*dt);player.y+=player.vy*dt;
      const ground=terrainY(player.x+player.w/2)-player.h;
      player.onGround=false;if(player.y>=ground){player.y=ground;player.vy=0;player.onGround=true;}
      if(player.vy>=0)for(const platform of platforms){if(previousBottom<=platform.y&&player.y+player.h>=platform.y&&player.x+player.w>platform.x&&player.x<platform.x+platform.w){player.y=platform.y-player.h;player.vy=0;player.onGround=true;}}
      if(player.onGround)coyoteTime=.12;
      player.fireCd=Math.max(0,player.fireCd-dt);player.pulseCd=Math.max(0,player.pulseCd-dt);player.dashCd=Math.max(0,player.dashCd-dt);player.invulnerable=Math.max(0,player.invulnerable-dt);
      player.meleeFx=Math.max(0,(player.meleeFx||0)-dt);
      if(reloadTimer>0){reloadTimer-=dt;if(reloadTimer<=0){reloadTimer=0;const reloaded=currentWeapon();if(reloaded.mag)weaponAmmo[reloaded.id]=reloaded.mag;}}
      player.energy=Math.min(100,player.energy+8*dt);
      if(mouse.down&&binds.shoot==="Mouse0")fire();
      for(const b of bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
        if(b.x<cameraX-50||b.x>cameraX+width+50||b.y<0||b.y>height||b.x<0||b.x>WORLD_LENGTH)b.life=0;
        if(!b.enemy)for(const e of enemies){if(b.life>0&&b.x+b.r>e.x&&b.x-b.r<e.x+e.w&&b.y+b.r>e.y&&b.y-b.r<e.y+e.h){e.hp-=b.damage;e.hitTimer=2.4;e.flash=.12;b.life=0;spawnParticles(b.x,b.y,"#ffc866",5,100);sound(115,.045,"triangle",.035);}}
      }
      const level=Math.min(6,Math.floor(player.x/DISTRICT_LENGTH)+1);
      if(level!==currentLevel){currentLevel=level;showToast(`AREA ${String(level).padStart(2,"0")} // ${districts[level-1].name}`);sound(440+level*50,.25,"sine",.06);spawnTimer=1.2;}
      byId("worldLabel").textContent=`LEVEL ${String(level).padStart(2,"0")} // ${districts[level-1].name}`;
      if(level>=3&&lastBossLevel<level){lastBossLevel=level;spawnEnemy(Math.min(WORLD_LENGTH-150,Math.max(player.x+650,(level-1)*DISTRICT_LENGTH+450)),"heavy");showToast(`ELITE SIGNAL // ${districts[level-1].name}`);}
      spawnTimer-=dt;
      if(spawnTimer<=0&&enemies.length<6){const ahead=Math.min(460,Math.max(240,width*.48));spawnEnemy(Math.min(WORLD_LENGTH-100,player.x+ahead+Math.random()*110),firstSpawn?"short":null);firstSpawn=false;spawnTimer=currentDifficulty().spawn*Math.max(.65,1-(level-1)*.06)+Math.random()*1.4;}
      const levelSpeed=1+(level-1)*.1;
      for(const e of enemies){
        e.flash=Math.max(0,e.flash-dt);e.hitTimer=Math.max(0,e.hitTimer-dt);e.attackTimer=Math.max(0,e.attackTimer-dt);e.y=terrainY(e.x+e.w/2)-e.h;
        const dx=player.x-e.x,distance=Math.abs(dx),verticalDistance=Math.abs(player.y-e.y);
        const awareness=e.kind==="long"?760:e.kind==="heavy"?650:560;
        if(distance<awareness){e.face=Math.sign(dx)||e.face;const desired=e.kind==="melee"?0:e.range*.72,error=distance-desired;
          if(Math.abs(error)>28)e.vx+=Math.sign(error)*e.face*e.speed*5*dt;else e.vx*=Math.pow(.02,dt);
        }else{
          const patrolTarget=e.anchor+Math.sin(worldTime*.72+e.phase)*85,patrolError=patrolTarget-e.x;
          if(Math.abs(patrolError)>12){e.vx+=Math.sign(patrolError)*e.speed*2.8*dt;e.face=Math.sign(patrolError);}else e.vx*=Math.pow(.1,dt);
        }
        const maxSpeed=Math.max(42,e.speed*1.5)*levelSpeed;e.vx=Math.max(-maxSpeed,Math.min(maxSpeed,e.vx));e.x+=e.vx*dt;e.x=Math.max(35,Math.min(WORLD_LENGTH-e.w,e.x));
        if(e.kind==="melee"){
          if(distance<e.w+player.w+48&&verticalDistance<58&&e.attackTimer<=0&&e.windup<=0)e.windup=.32;
          if(e.windup>0){e.windup-=dt;if(e.windup<=0){e.attackTimer=.9/levelSpeed;if(distance<e.w+player.w+66&&verticalDistance<64&&player.invulnerable<=0)damagePlayer(e.damage);}else e.vx=e.face*e.speed*1.8;}
        }
        else {e.fireCd-=dt;if(distance<e.range&&verticalDistance<145&&e.fireCd<=0){e.fireCd=e.fireRate/levelSpeed+(Math.random()*.3);const angle=Math.atan2(player.y+player.h*.48-(e.y+e.h*.5),player.x+player.w/2-(e.x+e.w/2));const speed=e.kind==="long"?320:e.kind==="heavy"?280:235;bullets.push({x:e.x+e.w/2,y:e.y+e.h*.5,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r:e.kind==="heavy"?5:3,life:2.5,damage:e.damage,enemy:true});}}
      }
      for(const b of bullets){if(b.enemy&&Math.abs(b.x-(player.x+player.w/2))<player.w/2+b.r&&Math.abs(b.y-(player.y+player.h/2))<player.h/2+b.r){b.life=0;if(player.invulnerable<=0)damagePlayer(b.damage);}}
      bullets=bullets.filter(b=>b.life>0);
      const before=enemies.length;
      enemies=enemies.filter(e=>{if(e.hp<=0){kills++;gainXp(e.kind==="heavy"?60:e.kind==="long"?18:12);spawnParticles(e.x+e.w/2,e.y+e.h/2,e.kind==="melee"?"#ff557c":e.kind==="long"?"#d084ff":"#52f6ef",16,180);if(Math.random()<.24)pickups.push({x:e.x,y:e.y-5,life:9,type:"health"});if(Math.random()<.48)pickups.push({x:e.x+12,y:e.y-12,life:10,type:"xp",amount:8});sound(85,.15,"sawtooth",.055);return false;}return e.x>player.x-width*1.6;});
      if(enemies.length<before){byId("killFlash").classList.remove("flash");void byId("killFlash").offsetWidth;byId("killFlash").classList.add("flash");}
      for(const p of pickups){p.life-=dt;if(Math.abs(p.x-player.x)<24&&Math.abs(p.y-player.y)<55){if(p.type==="xp")gainXp(p.amount);else{player.health=Math.min(player.maxHealth,player.health+22);showToast("BIOMONITOR PATCH // +22 VITALS");}p.life=0;sound(700,.12,"sine",.05);}}
      pickups=pickups.filter(p=>p.life>0);
      for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=300*dt;p.life-=dt;p.vx*=Math.pow(.12,dt);}
      particles=particles.filter(p=>p.life>0);
      activateCheckpoints();
      cameraX=Math.max(0,Math.min(WORLD_LENGTH-width,player.x-width*.38));shake=Math.max(0,shake-dt*28);
      if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)byId("toast").classList.remove("show");}
      if(player.x>=WORLD_LENGTH-player.w){player.x=WORLD_LENGTH-player.w;player.vx=0;if(!frontierReached){frontierReached=true;showToast("FRONTIER REACHED // THE WASTELAND IS YOURS");}}
      updateHud();if(player.health<=0){playing=false;paused=true;byId("finalKills").textContent=kills;setOverlay("deadOverlay");sound(65,.5,"sawtooth",.1);}
    }
    function damagePlayer(amount){player.health-=amount;player.invulnerable=.36;shake=8;spawnParticles(player.x+player.w/2,player.y+player.h/2,"#ff477e",7,100);sound(80,.12,"sawtooth",.06);}
    function drawSky(){
      const zone=Math.min(districts.length-1,Math.floor((cameraX+width*.5)/DISTRICT_LENGTH)),area=districts[zone],glow=Number(byId("glow").value)/75,gradient=ctx.createLinearGradient(0,0,0,height);gradient.addColorStop(0,area.sky[0]);gradient.addColorStop(.55,area.sky[1]);gradient.addColorStop(1,area.sky[2]);ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
      const dusk=ctx.createLinearGradient(0,height*.28,0,height*.75);dusk.addColorStop(0,"transparent");dusk.addColorStop(.55,`${area.glow}0c`);dusk.addColorStop(1,"transparent");ctx.fillStyle=dusk;ctx.fillRect(0,height*.25,width,height*.5);
      const moonX=width*.73-cameraX*.025;ctx.save();ctx.shadowBlur=30*glow;ctx.shadowColor=area.glow;ctx.fillStyle=area.glow;ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(moonX,105,30,0,Math.PI*2);ctx.fill();ctx.restore();
      for(const flyer of skyTraffic){
        const travel=animationTime*flyer.speed*flyer.direction-cameraX*.13;
        const span=width+180,x=((flyer.x+travel)%span+span)%span-70,y=flyer.y+Math.sin(animationTime*1.4+flyer.x)*5;
        ctx.save();ctx.globalAlpha=.48+Math.sin(animationTime*2+flyer.x)*.14;ctx.shadowBlur=12;ctx.shadowColor=flyer.color;ctx.fillStyle=flyer.color;ctx.fillRect(x,y,20,2);ctx.fillRect(x+5,y-2,9,2);ctx.globalAlpha=.19;ctx.fillRect(x-flyer.direction*4,y+1,-flyer.direction*16,1);ctx.restore();
      }
      for(let layer=0;layer<3;layer++){
        const speed=[.08,.16,.28][layer],base=height*(.49+layer*.075),offset=-(cameraX*speed)%140;
        for(let x=offset-140;x<width+150;x+=140){
          const seed=Math.abs(Math.floor((x-offset+cameraX*speed)/140)),h=55+(seed*73%110),buildingWidth=seed%3===0?86:112,buildingTop=base-h;
          ctx.fillStyle=["#10192b","#101728","#111322"][layer];ctx.fillRect(x,buildingTop,buildingWidth,h+height-base);
          if(layer<2){
            for(let wy=buildingTop+13;wy<base-8;wy+=17)for(let wx=x+9;wx<x+buildingWidth-5;wx+=16){
              if(((wx*wy+seed)%5)<=1)continue;
              const blink=Math.sin(animationTime*(.65+((wx+wy)%4)*.18)+(wx*wy)%31);
              const pulse=blink>.88?.95:.35+((wx+wy)%3)*.12;
              ctx.globalAlpha=pulse;ctx.fillStyle=(wx+wy+seed)%4===0?"#fd4b9b":area.glow;ctx.fillRect(wx,wy,4,7);
            }
            ctx.globalAlpha=1;
            if(seed%3===0){
              const signY=buildingTop+25+seed%45;
              ctx.save();ctx.globalAlpha=.58+Math.sin(animationTime*2+seed)*.22;ctx.shadowBlur=12;ctx.shadowColor=seed%2?area.glow:"#ff4d9d";ctx.fillStyle=seed%2?area.glow:"#ff4d9d";ctx.fillRect(x+18,signY,buildingWidth-36,2);ctx.fillRect(x+25,signY+6,buildingWidth-50,1);ctx.restore();
            }
          }
        }
      }
      for(let i=0;i<45;i++){const x=((i*197-cameraX*.48)% (width+50)+width+50)%(width+50),y=70+(i*89%Math.max(80,height*.47));ctx.fillStyle=i%5===0?"#67fff3":"#ffffff";ctx.globalAlpha=.2+(i%4)*.11;ctx.fillRect(x,y,1.5,1.5);}ctx.globalAlpha=1;
    }
    function drawTerrain(){
      const tile=32,start=Math.floor(cameraX/tile)*tile,end=cameraX+width+tile;
      for(let x=start;x<end;x+=tile){const surface=terrainY(x+tile/2),screenX=x-cameraX,area=districts[Math.min(districts.length-1,Math.floor((x+tile/2)/DISTRICT_LENGTH))];const top=Math.floor(surface/tile)*tile;
        for(let y=top;y<height+tile;y+=tile){if(y<surface-4)continue;ctx.fillStyle=y<surface+12?area.ground[0]:y<surface+70?area.ground[1]:area.ground[2];ctx.fillRect(screenX,y,tile+1,tile+1);
          ctx.fillStyle=y<surface+12?area.glow:"#313248";ctx.fillRect(screenX,y,tile+1,3);
          if(((x*7+y*3)%11)<3){ctx.fillStyle=y<surface+12?"#ff4d9d":"#262c3e";ctx.fillRect(screenX+((x+y)%21),y+10,3,3);}
        }
        if(Math.abs(Math.sin(x*.03))>.97){ctx.fillStyle="#a8fff3";ctx.shadowBlur=8;ctx.shadowColor="#52f6ef";ctx.fillRect(screenX+7,surface-12,3,12);ctx.shadowBlur=0;}
      }
      for(const platform of platforms){if(platform.x+platform.w<cameraX-20||platform.x>cameraX+width+20)continue;const x=platform.x-cameraX;ctx.fillStyle="#101728";ctx.fillRect(x,platform.y,platform.w,12);ctx.fillStyle="#52f6ef";ctx.shadowBlur=12;ctx.shadowColor="#52f6ef";ctx.fillRect(x,platform.y,platform.w,3);ctx.shadowBlur=0;ctx.fillStyle="#ff4d9d";ctx.fillRect(x+8,platform.y+10,platform.w-16,2);if(platform.step%4===0){ctx.fillStyle="#95a9bb";ctx.font="600 8px Orbitron";ctx.fillText("PARKOUR // VERTICAL ROUTE",x,platform.y-7);}}
      for(const point of checkpointObjects){const x=point.x-cameraX;if(x<-35||x>width+35)continue;const surface=terrainY(point.x);point.y=surface;ctx.save();ctx.shadowBlur=point.active?22:13;ctx.shadowColor=point.active?"#52f6ef":"#9e77ff";ctx.fillStyle=point.active?"#52f6ef":"#9e77ff";ctx.fillRect(x-3,surface-43,6,43);ctx.fillRect(x-11,surface-46,22,5);ctx.fillStyle="#f1f6ff";ctx.beginPath();ctx.arc(x,surface-48,4,0,Math.PI*2);ctx.fill();ctx.restore();ctx.font="600 8px Orbitron";ctx.fillStyle=point.active?"#8cfff1":"#c7b0ff";ctx.textAlign="center";ctx.fillText(point.active?"CHECKPOINT SAVED":`SAVE POINT // ${point.id}`,x,surface-56);ctx.textAlign="left";}
    }
    function drawCharacter(x,y,face,enemy=false,flash=0,kind="short",w=25,h=45){
      ctx.save();ctx.translate(Math.round(x+w/2),Math.round(y));ctx.scale(face*w/25,h/45);
      const accent=enemy?(flash?"#fff":kind==="long"?"#d084ff":kind==="melee"?"#ff557c":"#ff4d9d"):(flash?"#fff":"#52f6ef");
      ctx.fillStyle="#111322";ctx.fillRect(-8,25,7,16);ctx.fillRect(2,25,7,16);ctx.fillStyle="#20283a";ctx.fillRect(-9,38,10,6);ctx.fillRect(1,38,10,6);
      ctx.fillStyle=enemy?"#71364f":"#23344a";ctx.fillRect(-10,14,20,15);ctx.fillStyle=accent;ctx.fillRect(-10,14,20,3);ctx.fillRect(-12,17,4,10);ctx.fillRect(8,17,4,10);
      ctx.fillStyle="#c58070";ctx.fillRect(-7,3,14,12);ctx.fillStyle="#101522";ctx.fillRect(-9,1,17,7);ctx.fillStyle=accent;ctx.fillRect(-5,7,11,3);
      if(!enemy){ctx.fillStyle="#171a2b";ctx.fillRect(-11,0,20,4);ctx.fillStyle="#ff4d9d";ctx.fillRect(-11,0,5,2);}
      if(enemy){ctx.fillStyle="#e3d4c5";ctx.fillRect(8,18,16,4);ctx.fillStyle="#687a89";ctx.fillRect(21,17,7,6);ctx.fillStyle=accent;ctx.fillRect(27,19,4,2);if(kind==="melee"){ctx.fillStyle="#d8dce5";ctx.fillRect(11,17,14,3);ctx.fillRect(22,15,3,7);}if(kind==="heavy"){ctx.fillStyle="#333149";ctx.fillRect(-13,13,5,17);ctx.fillRect(8,13,6,17);ctx.fillStyle="#ffdc7c";ctx.fillRect(-5,12,10,5);}}
      ctx.restore();
    }
    function drawPlayerWeapon(){
      const weapon=currentWeapon(),x=player.x-cameraX+12,y=player.y+21,angle=Math.atan2(mouse.y-y,mouse.x-x);
      if(weapon.category==="melee"){
        ctx.save();ctx.translate(x,y);ctx.rotate(player.meleeFx>0?player.meleeAngle:angle);ctx.shadowBlur=11;ctx.shadowColor=weapon.color;ctx.fillStyle=weapon.color;ctx.fillRect(9,-2,weapon.range*.56,4);ctx.fillStyle="#fff0c4";ctx.fillRect(13,-1,weapon.range*.43,2);ctx.restore();
        if(player.meleeFx>0){ctx.save();ctx.globalAlpha=player.meleeFx/.2*.65;ctx.strokeStyle=weapon.color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,weapon.range*.75,player.meleeAngle-.8,player.meleeAngle+.8);ctx.stroke();ctx.restore();}
        return;
      }
      const barrel=weapon.id==="rail"?33:weapon.id==="rifle"||weapon.id==="burst"?25:weapon.id==="scatter"?21:weapon.id==="smg"?19:16;
      ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.shadowBlur=9;ctx.shadowColor=weapon.color;ctx.fillStyle="#111522";ctx.fillRect(-4,-4,16,9);ctx.fillStyle=weapon.color;ctx.fillRect(8,-3,barrel,5);ctx.fillStyle="#dce8f1";ctx.fillRect(8,-1,barrel-2,1);ctx.fillStyle=weapon.color;ctx.fillRect(8+barrel,-2,weapon.id==="rail"?6:4,3);ctx.fillStyle="#ff4d9d";ctx.fillRect(-2,4,6,7);ctx.restore();
    }
    function drawEnemyBar(e){
      const near=Math.abs((e.x+e.w/2)-(player.x+player.w/2))<210;
      if(e.hitTimer<=0&&!near&&e.kind!=="heavy")return;
      const x=e.x-cameraX,y=e.y-12,w=Math.max(30,e.w),ratio=Math.max(0,e.hp/e.maxHp);
      ctx.fillStyle="#070b16dd";ctx.fillRect(x-2,y-2,w+4,7);ctx.fillStyle="#6b263e";ctx.fillRect(x,y,w,3);ctx.fillStyle=e.kind==="heavy"?"#ff4d9d":e.kind==="long"?"#d084ff":"#ff6b83";ctx.fillRect(x,y,w*ratio,3);
      if(near&&Math.abs((e.x+e.w/2)-(player.x+player.w/2))<100||e.hitTimer>0||e.kind==="heavy"){ctx.font="600 8px Orbitron";ctx.fillStyle=e.kind==="heavy"?"#ff97bd":"#d3dfeb";ctx.fillText(e.kind==="heavy"?"ELITE ENFORCER":`${e.kind.toUpperCase()} // ${Math.ceil(e.hp)} HP`,x-2,y-6);}
    }
    function render(){
      ctx.save();if(shake>0)ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
      drawSky();drawTerrain();
      for(const p of pickups){const x=p.x-cameraX,y=p.y+Math.sin(worldTime*5+p.x)*4;ctx.save();ctx.shadowBlur=14;ctx.shadowColor=p.type==="xp"?"#b38bff":"#52f6ef";ctx.fillStyle=p.type==="xp"?"#b38bff":"#52f6ef";if(p.type==="xp"){ctx.translate(x,y);ctx.rotate(Math.PI/4);ctx.fillRect(-5,-5,10,10);}else{ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();}ctx.restore();}
      for(const e of enemies)if(e.x>cameraX-70&&e.x<cameraX+width+70){drawCharacter(e.x-cameraX,e.y,e.face,true,e.flash>0,e.kind,e.w,e.h);drawEnemyBar(e);if(e.windup>0){ctx.strokeStyle="#ffdc7c";ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x-cameraX+e.w/2,e.y-7,8+Math.sin(worldTime*30)*3,0,Math.PI*2);ctx.stroke();}}
      for(const b of bullets){ctx.save();ctx.shadowBlur=12;ctx.shadowColor=b.enemy?"#ff4d9d":b.color||"#ffc866";ctx.fillStyle=b.enemy?"#ff4d9d":b.color||"#ffe393";ctx.beginPath();ctx.arc(b.x-cameraX,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.restore();}
      for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x-cameraX,p.y,p.size,p.size);}ctx.globalAlpha=1;
      if(player.invulnerable<=0||Math.floor(worldTime*20)%2===0)drawCharacter(player.x-cameraX,player.y,player.face,false,0,"short",player.w,player.h);
      drawPlayerWeapon();
      const boss=enemies.find(e=>e.kind==="heavy"&&e.x>cameraX-100&&e.x<cameraX+width+100);
      if(boss){const barWidth=Math.min(360,width*.6),barX=(width-barWidth)/2,barY=100;ctx.fillStyle="#070b16dd";ctx.fillRect(barX-3,barY-3,barWidth+6,19);ctx.fillStyle="#41233b";ctx.fillRect(barX,barY,barWidth,5);ctx.fillStyle="#ff4d9d";ctx.fillRect(barX,barY,barWidth*Math.max(0,boss.hp/boss.maxHp),5);ctx.font="600 10px Orbitron";ctx.textAlign="center";ctx.fillStyle="#ffe2ec";ctx.fillText("ELITE ENFORCER",width/2,barY-7);ctx.textAlign="left";}
      if(player.pulseCd>0){ctx.fillStyle="#a9bcc633";ctx.fillRect(player.x-cameraX+4,player.y-9,18*(1-player.pulseCd/5.5),2);}
      const depth=Math.floor(player.x/100);ctx.font="600 10px Orbitron";ctx.fillStyle="#b4c4d2";ctx.fillText(`LEVEL ${String(Math.min(6,Math.floor(player.x/DISTRICT_LENGTH)+1)).padStart(2,"0")} · ${String(depth).padStart(2,"0")}00m`,width-240,height-54);
      const miniX=width-152,miniY=height-35;ctx.fillStyle="#080b16a8";ctx.fillRect(miniX,miniY,132,9);ctx.fillStyle="#52f6ef";ctx.fillRect(miniX+(player.x/WORLD_LENGTH)*132-2,miniY+1,4,7);for(const e of enemies){const mx=miniX+(e.x/WORLD_LENGTH)*132;ctx.fillStyle=e.kind==="heavy"?"#ff4d9d":"#ff9b75";ctx.fillRect(mx,miniY+2,e.kind==="heavy"?3:2,5);}
      if(playing&&!paused){ctx.save();ctx.translate(mouse.x,mouse.y);ctx.strokeStyle="#52f6ef";ctx.lineWidth=1;ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.moveTo(-13,0);ctx.lineTo(-5,0);ctx.moveTo(5,0);ctx.lineTo(13,0);ctx.moveTo(0,-13);ctx.lineTo(0,-5);ctx.moveTo(0,5);ctx.lineTo(0,13);ctx.stroke();ctx.restore();}
      ctx.restore();
      const vignette=ctx.createRadialGradient(width/2,height/2,height*.22,width/2,height/2,height*.8);vignette.addColorStop(0,"transparent");vignette.addColorStop(1,"#03040c8c");ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);
    }
    function loop(time){const dt=Math.min(.04,(time-lastTime)/1000||0);lastTime=time;animationTime+=dt;update(dt);render();requestAnimationFrame(loop);}
    resetGame();requestAnimationFrame(loop);
  })();
