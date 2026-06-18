const $ = (selector) => document.querySelector(selector);

function injectFinalVisualOverrides() {
  if (document.getElementById("claudioFinalVisualOverrides")) return;
  const style = document.createElement("style");
  style.id = "claudioFinalVisualOverrides";
  style.textContent = `
body.immersive-lyrics-open .player .controls{display:grid!important;grid-template-columns:repeat(5,48px)!important;grid-auto-flow:row!important;grid-auto-rows:48px!important;grid-auto-columns:48px!important;justify-content:center!important;justify-items:center!important;align-items:center!important;width:320px!important;max-width:320px!important;height:auto!important;gap:16px 20px!important;margin-inline:auto!important}
body.immersive-lyrics-open .player .controls #favoritePlaylistMenu.hidden{display:none!important}
body.immersive-lyrics-open .player .controls-row-primary,body.immersive-lyrics-open .player .controls-row-tools{display:contents!important}
body.immersive-lyrics-open .player .controls #prevBtn,body.immersive-lyrics-open .player .controls #nextBtn,body.immersive-lyrics-open .player .controls #playBtn,body.immersive-lyrics-open .player .controls #favoritePlaylistBtn,body.immersive-lyrics-open .player .controls #modeBtn,body.immersive-lyrics-open .player .controls #qualityBtn,body.immersive-lyrics-open .player .controls #likeBtn,body.immersive-lyrics-open .player .controls #desktopLyricsBtn,body.immersive-lyrics-open .player .controls #memoryCoordinateBtn,body.immersive-lyrics-open .player .controls #sequenceBtn{position:static!important;display:grid!important;grid-column:auto!important;grid-row:auto!important;width:48px!important;min-width:48px!important;height:48px!important;min-height:48px!important;margin:0!important;padding:0!important;place-items:center!important;border:0!important;border-radius:999px!important;background:rgba(255,255,255,.04)!important;color:rgba(247,242,234,.92)!important;box-shadow:none!important;font-size:20px!important}
body.immersive-lyrics-open .player .controls #likeBtn{grid-column:1!important;grid-row:1!important}
body.immersive-lyrics-open .player .controls #prevBtn{grid-column:2!important;grid-row:1!important}
body.immersive-lyrics-open .player .controls #playBtn{grid-column:3!important;grid-row:1!important}
body.immersive-lyrics-open .player .controls #nextBtn{grid-column:4!important;grid-row:1!important}
body.immersive-lyrics-open .player .controls #favoritePlaylistBtn{grid-column:5!important;grid-row:1!important}
body.immersive-lyrics-open .player .controls #modeBtn{grid-column:1!important;grid-row:2!important;transform:translateX(34px)!important}
body.immersive-lyrics-open .player .controls #qualityBtn{grid-column:2!important;grid-row:2!important;transform:translateX(34px)!important}
body.immersive-lyrics-open .player .controls #memoryCoordinateBtn{grid-column:3!important;grid-row:2!important;transform:translateX(34px)!important}
body.immersive-lyrics-open .player .controls #desktopLyricsBtn{grid-column:4!important;grid-row:2!important;transform:translateX(34px)!important}
body.immersive-lyrics-open .player .controls #playBtn{width:58px!important;min-width:58px!important;height:58px!important;min-height:58px!important;background:rgba(217,77,77,.92)!important;color:#fff!important}
body.immersive-lyrics-open .player .controls #qualityBtn{font-size:12px!important}
body:not(.immersive-lyrics-open) .player .controls #sequenceBtn{display:none!important}
.favorite-playlist-menu::before{display:none!important;content:none!important}
.quality-menu{position:absolute!important;right:0!important;bottom:calc(100% + 12px)!important;z-index:92!important;width:min(280px,calc(100vw - 36px))!important;padding:8px!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:14px!important;background:rgba(11,9,9,.96)!important;box-shadow:0 22px 54px rgba(0,0,0,.52)!important;backdrop-filter:blur(18px)!important}
.quality-menu.hidden{display:none!important}
.quality-menu button{min-height:42px!important;display:grid!important;grid-template-columns:18px minmax(0,1fr)!important;align-items:center!important;gap:8px!important;padding:7px 9px!important;border:0!important;border-radius:10px!important;background:rgba(255,255,255,.055)!important;color:rgba(255,255,255,.88)!important;text-align:left!important;font-size:13px!important}
.quality-menu button:hover,.quality-menu button.active{background:rgba(255,59,74,.16)!important;color:#fff!important}
.quality-menu .quality-check{font-size:13px!important;color:#ff5b64!important}
.songid-intro-editor{position:fixed!important;inset:0!important;z-index:260!important;display:grid!important;place-items:center!important;padding:28px!important;background:rgba(3,6,10,.62)!important;backdrop-filter:blur(12px)!important}
.songid-intro-editor.hidden{display:none!important}
.songid-intro-dialog{width:min(620px,calc(100vw - 44px))!important;display:grid!important;gap:14px!important;padding:22px!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:20px!important;background:#10161d!important;box-shadow:0 28px 90px rgba(0,0,0,.48)!important}
.songid-intro-dialog h3{margin:0!important;color:#f8f4ed!important;font-size:20px!important;line-height:1.2!important}
.songid-intro-dialog textarea{width:100%!important;min-height:150px!important;resize:vertical!important;box-sizing:border-box!important;padding:14px!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:14px!important;background:#151c24!important;color:#f8f4ed!important;font:inherit!important;line-height:1.5!important;outline:none!important}
.songid-intro-dialog textarea:focus{border-color:rgba(217,77,77,.72)!important}
.songid-intro-actions{display:flex!important;justify-content:flex-end!important;gap:10px!important}
.songid-intro-actions button{height:38px!important;min-width:82px!important;padding:0 16px!important;border:0!important;border-radius:12px!important;background:#151c24!important;color:#f8f4ed!important;font-weight:720!important;box-shadow:none!important}
.songid-intro-actions button[data-save]{background:#d94d4d!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist,body.immersive-lyrics-open.lyrics-queue-open #playlist.hidden{width:min(420px,calc(100vw - 410px))!important;min-width:360px!important;height:calc(100vh - 74px)!important;max-height:calc(100vh - 74px)!important;padding:0!important;grid-template-rows:auto minmax(0,1fr)!important;overflow:hidden!important;border:1px solid rgba(255,255,255,.08)!important;background:rgba(16,22,29,.96)!important;color:#f7f2ea!important;box-shadow:0 28px 80px rgba(0,0,0,.48)!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist .panel-sticky{padding:13px 10px 7px!important;background:rgba(16,22,29,.96)!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist .panel-head h3{color:#f7f2ea!important;font-size:20px!important;margin-left:12px!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist .playlist-head-actions{display:flex!important;align-items:center!important;gap:8px!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist .playlist-history-actions{display:flex!important;align-items:center!important;gap:6px!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist .playlist-history-button{width:30px!important;height:30px!important;min-width:30px!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:999px!important;background:rgba(255,255,255,.055)!important;color:rgba(247,242,234,.88)!important;font-size:16px!important;display:grid!important;place-items:center!important;padding:0!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist .playlist-history-button:disabled{opacity:.32!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist #playlistMeta{color:rgba(247,242,234,.58)!important;font-size:13px!important;white-space:nowrap!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist .playlist-list{width:calc(100% - 8px)!important;height:100%!important;min-height:0!important;max-height:none!important;box-sizing:border-box!important;padding:0 0 8px!important;gap:6px!important;transform:translateX(-13px)!important;scrollbar-gutter:stable!important;overflow:hidden auto!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist .playlist-row{width:100%!important;min-height:62px!important;grid-template-columns:minmax(0,1fr) 38px!important;gap:5px!important;padding:0!important;border-radius:9px!important;background:transparent!important;color:#f7f2ea!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist .playlist-row.active-sequence{background:rgba(255,55,67,.1)!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist .row-left{grid-template-columns:22px 42px minmax(0,1fr)!important;gap:7px!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist .row-index{color:rgba(247,242,234,.46)!important;font-size:14px!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist .row-cover,body.immersive-lyrics-open.lyrics-queue-open #playlist .row-cover-fallback{width:40px!important;height:40px!important;border-radius:6px!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist .row-main strong{color:#f7f2ea!important;font-size:17px!important;font-weight:650!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist .playlist-row.active-sequence .row-main strong{color:#ff5b64!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist .row-main small{margin-top:5px!important;color:rgba(247,242,234,.55)!important;font-size:14px!important}
body.immersive-lyrics-open.lyrics-queue-open #playlist .row-duration{color:rgba(247,242,234,.54)!important;font-size:15px!important}
body.immersive-lyrics-open .lyrics-panel .panel-sticky,body.immersive-lyrics-open .lyrics-panel .panel-back-button{display:none!important}
body.immersive-lyrics-open .shell,body.immersive-lyrics-open.lyrics-queue-open .shell{grid-template-columns:360px minmax(0,1fr)!important;gap:24px!important;overflow:hidden!important}
body.immersive-lyrics-open #profile,body.immersive-lyrics-open #profile.hidden,body.immersive-lyrics-open .lyrics-panel{display:grid!important;grid-column:2!important;grid-row:1!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;visibility:visible!important;opacity:1!important}
body.immersive-lyrics-open .lyrics-panel .lyric-stage{display:grid!important;grid-template-rows:auto auto minmax(0,1fr)!important;width:100%!important;height:100%!important;min-height:0!important;padding:44px clamp(36px,5vw,76px)!important;visibility:visible!important;opacity:1!important}
body.immersive-lyrics-open .lyrics-panel .lyric-list{display:flex!important;width:100%!important;min-height:0!important;visibility:visible!important;opacity:1!important;overflow:hidden auto!important}
body.immersive-lyrics-open .lyrics-panel .lyric-stage.pure-instrumental{grid-template-rows:1fr!important;padding:44px clamp(36px,5vw,76px)!important}
body.immersive-lyrics-open .lyrics-panel .lyric-stage.pure-instrumental #currentLyric,body.immersive-lyrics-open .lyrics-panel .lyric-stage.pure-instrumental #nextLyric{display:none!important}
body.immersive-lyrics-open .lyrics-panel .lyric-stage.pure-instrumental .lyric-list{height:100%!important;min-height:100%!important;display:grid!important;place-items:center!important;align-content:center!important;overflow:hidden!important}
body.immersive-lyrics-open .lyrics-panel .lyric-row.empty.has-meta{gap:14px!important}
body.immersive-lyrics-open .lyrics-panel .lyric-empty-title{display:block!important;font-size:clamp(34px,5vw,72px)!important;line-height:1.08!important;font-weight:760!important;color:rgba(247,242,234,.9)!important}
body.immersive-lyrics-open .lyrics-panel .lyric-empty-meta{display:grid!important;gap:8px!important;margin-top:8px!important;color:rgba(247,242,234,.58)!important;font-size:clamp(16px,1.6vw,24px)!important;line-height:1.35!important;font-weight:650!important;text-align:center!important}
body.immersive-lyrics-open .lyrics-panel .lyric-row{max-width:min(980px,100%)!important;margin-inline:auto!important}
body.immersive-lyrics-open .lyrics-panel #currentLyric{display:block!important;width:100%!important;max-width:min(980px,100%)!important;margin:0 auto 16px!important;text-align:center!important}
body.immersive-lyrics-open .lyrics-panel #nextLyric{display:block!important;width:100%!important;max-width:min(980px,100%)!important;margin:0 auto 22px!important;text-align:center!important}
body.immersive-lyrics-open .lyrics-panel .lyric-row.empty{min-height:100%!important;display:grid!important;place-items:center!important;width:100%!important;max-width:100%!important;text-align:center!important;font-size:clamp(34px,5vw,72px)!important;line-height:1.08!important;font-weight:760!important;color:rgba(247,242,234,.88)!important;letter-spacing:0!important;background:transparent!important;border:0!important}
body.immersive-lyrics-open .track{text-align:left!important;align-items:flex-start!important}
body.immersive-lyrics-open .track h1,body.immersive-lyrics-open .track h2,body.immersive-lyrics-open .track .album-line,body.immersive-lyrics-open .track #artist,body.immersive-lyrics-open .track #artist .artist-link,body.immersive-lyrics-open .track #artist .artist-separator{text-align:left!important;justify-content:flex-start!important}
body.immersive-lyrics-open .track #artist{display:flex!important;width:100%!important}
body.immersive-lyrics-open .player{overflow:visible!important}
body:not(.immersive-lyrics-open) .player{position:relative!important;overflow:visible!important}
body:not(.immersive-lyrics-open) .cover{position:relative!important;overflow:visible!important;aspect-ratio:1/1!important;filter:drop-shadow(0 24px 28px rgba(0,0,0,.34))!important}
body:not(.immersive-lyrics-open) .cover .cover-art{position:relative!important;z-index:4!important;width:100%!important;height:100%!important;object-fit:cover!important;aspect-ratio:1/1!important}
body:not(.immersive-lyrics-open) .cover .disc,body:not(.immersive-lyrics-open) .cover #scope{position:relative!important;z-index:4!important}
body .cover-reflection{position:absolute!important;left:0!important;right:0!important;top:calc(100% + 1px)!important;width:100%!important;height:var(--cover-reflection-height,min(34%,160px))!important;z-index:2!important;overflow:hidden!important;border-radius:0 0 18px 18px!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;background:transparent!important;-webkit-mask-image:linear-gradient(180deg,rgba(0,0,0,.96) 0%,rgba(0,0,0,.78) 44%,rgba(0,0,0,.18) 82%,rgba(0,0,0,0) 100%)!important;mask-image:linear-gradient(180deg,rgba(0,0,0,.96) 0%,rgba(0,0,0,.78) 44%,rgba(0,0,0,.18) 82%,rgba(0,0,0,0) 100%)!important}
body .cover.has-art .cover-reflection{opacity:.9!important;visibility:visible!important}
body .cover-reflection::after{content:""!important;position:absolute!important;inset:0!important;z-index:2!important;background:linear-gradient(180deg,rgba(11,17,23,0) 0%,rgba(11,17,23,.04) 42%,rgba(11,17,23,.36) 100%)!important;pointer-events:none!important}
body .cover-reflection img{position:absolute!important;left:0!important;right:0!important;top:auto!important;bottom:100%!important;width:100%!important;height:var(--cover-reflection-source-height,294.117647%)!important;min-height:100%!important;object-fit:cover!important;object-position:center bottom!important;transform:scaleY(-1)!important;transform-origin:center bottom!important;filter:saturate(.98) brightness(.88)!important}
body .cover::after{display:block!important;content:""!important;position:absolute!important;left:4px!important;right:4px!important;top:calc(100% + 6px)!important;height:118px!important;z-index:1!important;background:linear-gradient(180deg,rgba(0,0,0,.68),rgba(0,0,0,.28) 46%,rgba(0,0,0,0))!important;filter:blur(18px)!important;pointer-events:none!important}
body .cover::before{display:none!important;content:none!important}
body .player .album-reflection,body .player .album-reflection.visible{display:none!important;visibility:hidden!important;opacity:0!important}
body:not(.immersive-lyrics-open) .track,body:not(.immersive-lyrics-open) .progress,body:not(.immersive-lyrics-open) .controls{position:relative!important;z-index:4!important}
body.immersive-lyrics-open .cover{position:relative!important;overflow:visible!important;filter:drop-shadow(0 24px 28px rgba(0,0,0,.36))!important}
body.immersive-lyrics-open .cover .cover-art{position:relative!important;z-index:4!important;width:100%!important;height:100%!important;object-fit:cover!important;aspect-ratio:1/1!important}
body.immersive-lyrics-open .cover .disc,body.immersive-lyrics-open .cover #scope{position:relative!important;z-index:4!important}
body.immersive-lyrics-open .cover-reflection{height:var(--cover-reflection-height,min(46%,220px))!important;opacity:.94!important;-webkit-mask-image:linear-gradient(180deg,rgba(0,0,0,.98) 0%,rgba(0,0,0,.86) 30%,rgba(0,0,0,.52) 68%,rgba(0,0,0,0) 100%)!important;mask-image:linear-gradient(180deg,rgba(0,0,0,.98) 0%,rgba(0,0,0,.86) 30%,rgba(0,0,0,.52) 68%,rgba(0,0,0,0) 100%)!important}
body.immersive-lyrics-open .cover-reflection::after{background:linear-gradient(180deg,rgba(11,17,23,0) 0%,rgba(11,17,23,.08) 40%,rgba(11,17,23,.28) 100%)!important}
body.immersive-lyrics-open .cover::after{display:none!important;content:none!important}
body.immersive-lyrics-open .player .controls #sequenceBtn,body.immersive-lyrics-open.lyrics-queue-open .player .controls #sequenceBtn{position:fixed!important;right:28px!important;top:50%!important;z-index:120!important;display:grid!important;width:42px!important;min-width:42px!important;height:42px!important;min-height:42px!important;opacity:1!important;pointer-events:auto!important;transform:translateY(-50%)!important;background:rgba(16,22,29,.58)!important;border:1px solid rgba(255,255,255,.1)!important;box-shadow:0 12px 34px rgba(0,0,0,.32)!important}
body.immersive-lyrics-open.lyrics-queue-open .player .controls #sequenceBtn{right:452px!important}
body.immersive-lyrics-open{overflow:hidden!important}
body.immersive-lyrics-open .shell,body.immersive-lyrics-open.lyrics-queue-open .shell{height:100vh!important;min-height:100vh!important;max-height:100vh!important;align-items:stretch!important}
body.immersive-lyrics-open #profile,body.immersive-lyrics-open #profile.hidden,body.immersive-lyrics-open .lyrics-panel{height:100%!important;min-height:0!important;max-height:100%!important;align-self:stretch!important;grid-template-rows:minmax(0,1fr)!important}
body.immersive-lyrics-open .lyrics-panel .profile-cache{display:none!important}
body.immersive-lyrics-open .lyrics-panel .lyric-stage{height:100%!important;min-height:100%!important;max-height:100%!important;box-sizing:border-box!important}
body.immersive-lyrics-open .lyrics-panel .lyric-stage.pure-instrumental{grid-template-rows:minmax(0,1fr)!important;height:100%!important;min-height:100%!important}
body.immersive-lyrics-open .lyrics-panel .lyric-stage.pure-instrumental .lyric-list{height:100%!important;min-height:100%!important;max-height:100%!important}
body.songid-detail-open #songid{padding:24px 30px 28px!important;gap:22px!important;overflow:auto!important}
body.songid-detail-open #songid .panel-sticky{position:static!important;padding:0!important;margin:0!important;background:transparent!important;border:0!important;box-shadow:none!important}
body.songid-detail-open #songid .panel-sticky::before,body.songid-detail-open #songid .panel-head,body.songid-detail-open #songid .songid-search,body.songid-detail-open #songid .source-cards{display:none!important}
body.songid-detail-open #songid .songid-stage{display:block!important;min-height:0!important}
body.songid-detail-open #songid .songid-toolbar{position:relative!important;display:grid!important;grid-template-columns:48px minmax(0,1fr)!important;align-items:stretch!important;gap:14px!important;margin:0!important;padding:0!important}
body.songid-detail-open #songid .songid-topic{display:contents!important;min-width:0!important}
body.songid-detail-open #songid .songid-back{position:static!important;grid-column:1!important;width:48px!important;height:48px!important;min-width:48px!important;min-height:48px!important;align-self:start!important;margin-top:20px!important;border:0!important;border-radius:14px!important;background:#141b24!important;color:#f7f2ea!important;font-size:30px!important;line-height:1!important;box-shadow:none!important}
body.songid-detail-open #songid #songidMeta{grid-column:2!important;display:block!important;min-width:0!important}
body.songid-detail-open #songid .songid-detail-meta{position:relative!important;display:grid!important;grid-template-columns:150px minmax(0,1fr)!important;align-items:start!important;gap:28px!important;min-height:184px!important;padding:24px 26px 18px!important;border:1px solid rgba(255,255,255,.07)!important;border-radius:24px!important;background:#10161d!important;box-shadow:none!important}
body.songid-detail-open #songid .songid-detail-meta img,body.songid-detail-open #songid .songid-detail-cover-fallback{width:150px!important;height:150px!important;border-radius:16px!important;object-fit:cover!important;box-shadow:0 18px 38px rgba(0,0,0,.24)!important}
body.songid-detail-open #songid .songid-detail-copy{min-width:0!important;align-self:start!important;justify-self:start!important;display:grid!important;align-content:start!important;justify-items:start!important;text-align:left!important;padding-bottom:0!important}
body.songid-detail-open #songid .songid-detail-copy strong{display:block!important;max-width:100%!important;overflow:visible!important;text-overflow:clip!important;white-space:normal!important;color:#f8f4ed!important;font-size:clamp(24px,2.4vw,34px)!important;font-weight:820!important;line-height:1.08!important}
body.songid-detail-open #songid .songid-detail-copy small{display:block!important;margin-top:12px!important;color:#9fa8b4!important;font-size:16px!important;line-height:1.2!important}
body.songid-detail-open #songid .songid-detail-copy p{max-width:min(62ch,100%)!important;margin:12px 0 0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;color:#9fa8b4!important;font-size:16px!important;line-height:1.45!important}
body.songid-detail-open #songid .songid-detail-copy .songid-intro-line.hidden{display:none!important}
body.songid-detail-open #songid.songid-intro-expanded .songid-detail-meta{min-height:318px!important;align-items:start!important;padding-bottom:22px!important}
body.songid-detail-open #songid.songid-intro-expanded .songid-detail-copy{align-self:start!important}
body.songid-detail-open #songid.songid-intro-expanded .songid-detail-copy p{white-space:normal!important;display:block!important;max-height:8.8em!important;overflow:auto!important;padding-right:8px!important;text-overflow:clip!important}
body.songid-detail-open #songid .songid-intro-line{display:grid!important;grid-template-columns:minmax(0,1fr) 30px!important;align-items:center!important;gap:8px!important;max-width:min(66ch,100%)!important}
body.songid-detail-open #songid .songid-intro-line p{min-width:0!important}
body.songid-detail-open #songid .songid-intro-toggle{width:30px!important;height:30px!important;min-width:30px!important;min-height:30px!important;margin-top:10px!important;padding:0!important;border:0!important;border-radius:999px!important;background:rgba(255,255,255,.045)!important;color:#9fa8b4!important;box-shadow:none!important;font-size:16px!important;line-height:1!important;display:grid!important;place-items:center!important}
body.songid-detail-open #songid.songid-intro-expanded .songid-intro-toggle{color:#f8f4ed!important;background:rgba(255,255,255,.08)!important}
body.songid-detail-open #songid .songid-toolbar{position:relative!important;display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:18px!important;margin:0!important;padding:0!important}
body.songid-detail-open #songid .songid-topic{display:grid!important;grid-template-columns:48px minmax(0,1fr)!important;align-items:start!important;gap:14px!important;min-width:0!important}
body.songid-detail-open #songid .songid-back{position:static!important;grid-column:1!important;width:48px!important;height:48px!important;min-width:48px!important;min-height:48px!important;align-self:start!important;margin-top:20px!important;border:0!important;border-radius:14px!important;background:#141b24!important;color:#f7f2ea!important;font-size:30px!important;line-height:1!important;box-shadow:none!important}
body.songid-detail-open #songid #songidMeta{grid-column:2!important;display:block!important;min-width:0!important}
body.songid-detail-open #songid .songid-actions{position:static!important;z-index:5!important;display:flex!important;flex-wrap:wrap!important;gap:12px!important;align-items:center!important;justify-content:flex-start!important;margin:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;padding:0!important}
body.songid-detail-open #songid .songid-actions::before,body.songid-detail-open #songid .songid-actions::after{display:none!important;content:none!important}
body.songid-detail-open #songid #songidPlayAll,body.songid-detail-open #songid #songidAppendAll,body.songid-detail-open #songid #songidEditIntro{height:40px!important;min-height:40px!important;min-width:124px!important;padding:0 18px!important;border:0!important;border-radius:12px!important;box-shadow:none!important;color:#f8f4ed!important;font-size:14px!important;font-weight:720!important;flex:0 0 auto!important}
body.songid-detail-open #songid #songidPlayAll{background:#d94d4d!important}
body.songid-detail-open #songid #songidAppendAll,body.songid-detail-open #songid #songidEditIntro{background:#141b24!important}
body.songid-detail-open #songid .songid-action-menu-button,body.songid-detail-open #songid .songid-action-menu{display:none!important}
body.songid-detail-open #songid .songid-results{min-height:0!important;display:grid!important;align-content:start!important;gap:8px!important;overflow:auto!important;padding:44px 22px 18px!important;border:1px solid rgba(255,255,255,.07)!important;border-radius:22px!important;background:#10161d!important;box-shadow:none!important;counter-reset:songid-row!important}
body.songid-detail-open #songid .songid-results::before{content:"歌曲列表"!important;color:#8f99a6!important;font-size:14px!important;line-height:1!important}
body.songid-detail-open #songid .songid-card{min-height:58px!important;grid-template-columns:44px minmax(0,1fr) 36px 36px 36px!important;gap:12px!important;padding:6px 12px 6px 18px!important;border:0!important;border-radius:10px!important;background:#151c24!important;box-shadow:none!important}
body.songid-detail-open #songid .songid-card img,body.songid-detail-open #songid .songid-cover-fallback{display:none!important}
body.songid-detail-open #songid .songid-card::before{counter-increment:songid-row!important;content:counter(songid-row)!important;color:#d7d9dc!important;font-size:15px!important;font-variant-numeric:tabular-nums!important}
body.songid-detail-open #songid .songid-card strong{display:block!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;color:#f8f4ed!important;font-size:16px!important;font-weight:680!important}
body.songid-detail-open #songid .songid-card small{display:block!important;margin-top:4px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;color:rgba(247,242,234,.52)!important;font-size:12px!important;line-height:1.2!important}
body.songid-detail-open #songid .songid-card .song-action{width:34px!important;height:34px!important;min-width:34px!important;min-height:34px!important;border-radius:999px!important}
@media (max-width:980px){body.songid-detail-open #songid{padding:18px!important}body.songid-detail-open #songid .songid-toolbar{gap:14px!important}body.songid-detail-open #songid .songid-topic{grid-template-columns:44px minmax(0,1fr)!important;gap:10px!important}body.songid-detail-open #songid .songid-detail-meta{grid-template-columns:96px minmax(0,1fr)!important;gap:16px!important;min-height:148px!important;padding:18px!important}body.songid-detail-open #songid .songid-detail-meta img,body.songid-detail-open #songid .songid-detail-cover-fallback{width:96px!important;height:96px!important}body.songid-detail-open #songid .songid-detail-copy strong{max-width:100%!important;font-size:22px!important}body.songid-detail-open #songid .songid-actions{gap:10px!important}body.songid-detail-open #songid #songidPlayAll,body.songid-detail-open #songid #songidAppendAll,body.songid-detail-open #songid #songidEditIntro{min-width:0!important;padding:0 10px!important}body.songid-detail-open #songid .songid-results{padding:34px 12px 14px!important}}
`;
  document.head.appendChild(style);
}

injectFinalVisualOverrides();

const TRANSPORT_PREV_SVG = `
  <svg class="transport-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="5.5" y="5.5" width="2.5" height="13" rx="1.1"></rect>
    <path d="M18 6.2L9.6 12L18 17.8Z"></path>
  </svg>
`;

const TRANSPORT_NEXT_SVG = `
  <svg class="transport-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="16" y="5.5" width="2.5" height="13" rx="1.1"></rect>
    <path d="M6 6.2L14.4 12L6 17.8Z"></path>
  </svg>
`;

const els = {
  shell: $(".player"),
  cover: $("#cover"),
  coverArt: $("#coverArt"),
  coverReflectionArt: $("#coverReflectionArt"),
  scope: $("#scope"),
  mood: $("#mood"),
  title: $("#title"),
  artist: $("#artist"),
  album: $("#album"),
  libraryCount: $("#libraryCount"),
  hostLine: $("#hostLine"),
  currentLyric: $("#currentLyric"),
  nextLyric: $("#nextLyric"),
  lyricList: $("#lyricList"),
  play: $("#playBtn"),
  like: $("#likeBtn"),
  favoritePlaylist: $("#favoritePlaylistBtn"),
  favoritePlaylistMenu: $("#favoritePlaylistMenu"),
  quality: $("#qualityBtn"),
  qualityMenu: $("#qualityMenu"),
  volume: $("#volumeBtn"),
  volumeMenu: $("#volumeMenu"),
  volumeRange: $("#volumeRange"),
  volumeValue: $("#volumeValue"),
  desktopLyrics: $("#desktopLyricsBtn"),
  sequence: $("#sequenceBtn"),
  mode: $("#modeBtn"),
  next: $("#nextBtn"),
  prev: $("#prevBtn"),
  seek: $("#seek"),
  elapsed: $("#elapsed"),
  duration: $("#duration"),
  weather: $("#weather"),
  homeWeather: $("#homeWeather"),
  homePlaylistGrid: $("#homePlaylistGrid"),
  homePlaylistAdd: $("#homePlaylistAdd"),
  homePlaylistImport: $("#homePlaylistImport"),
  homePlaylistImportInput: $("#homePlaylistImportInput"),
  homePlaylistImportCancel: $("#homePlaylistImportCancel"),
  homeQueueOpen: $("#homeQueueOpen"),
  homePlaylistUndo: $("#homePlaylistUndo"),
  homePlaylistRedo: $("#homePlaylistRedo"),
  homeQueueMeta: $("#homeQueueMeta"),
  homeQueueList: $("#homeQueueList"),
  homeChatOpen: $("#homeChatOpen"),
  homeChatMemory: $("#homeChatMemory"),
  homeTaskAdd: $("#homeTaskAdd"),
  homeTaskForm: $("#homeTaskForm"),
  homeTaskInput: $("#homeTaskInput"),
  homeTaskCancel: $("#homeTaskCancel"),
  homeTaskList: $("#homeTaskList"),
  playlistMeta: $("#playlistMeta"),
  playlistBack: $("#playlistBack"),
  playlistUndo: $("#playlistUndo"),
  playlistRedo: $("#playlistRedo"),
  playlistSearch: $("#playlistSearch"),
  playlistInput: $("#playlistInput"),
  playlistList: $("#playlistList"),
  playlistPrev: $("#playlistPrev"),
  playlistNext: $("#playlistNext"),
  playlistPage: $("#playlistPage"),
  songidSearch: $("#songidSearch"),
  songidInput: $("#songidInput"),
  songidSourceAdd: $("#songidSourceAdd"),
  songidSourceImport: $("#songidSourceImport"),
  songidSourceImportInput: $("#songidSourceImportInput"),
  songidSourceImportCancel: $("#songidSourceImportCancel"),
  songidResults: $("#songidResults"),
  songidStage: $("#songidStage"),
  songidMeta: $("#songidMeta"),
  songidBack: $("#songidBack"),
  songidPlayAll: $("#songidPlayAll"),
  songidAppendAll: $("#songidAppendAll"),
  songidEditIntro: $("#songidEditIntro"),
  songidActionMenuBtn: $("#songidActionMenuBtn"),
  songidActionMenu: $("#songidActionMenu"),
  dailySource: $("#dailySourceBtn"),
  fmSource: $("#fmSourceBtn"),
  customPlaylistSource: $("#customPlaylistBtn"),
  tasteList: $("#tasteList"),
  profileSummary: $("#profileSummary"),
  chatMemory: $("#chatMemory"),
  history: $("#history"),
  chatForm: $("#chatForm"),
  chatInput: $("#chatInput"),
  chatLog: $("#chatLog")
};

if (els.prev) els.prev.innerHTML = TRANSPORT_PREV_SVG;
if (els.next) els.next.innerHTML = TRANSPORT_NEXT_SVG;

function ensureHomePlaylistSearchUi() {
  const sourceCard = document.querySelector(".home-sources");
  const head = sourceCard?.querySelector(".home-card-head");
  const importForm = els.homePlaylistImport;
  const addButton = els.homePlaylistAdd;
  if (!sourceCard || !head || !importForm || !addButton) return;

  let actions = head.querySelector(".home-playlist-head-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "home-playlist-head-actions";
    head.appendChild(actions);
  }
  if (addButton.parentElement !== actions) actions.appendChild(addButton);

  let searchButton = $("#homePlaylistSearchBtn");
  if (!searchButton) {
    searchButton = document.createElement("button");
    searchButton.type = "button";
    searchButton.id = "homePlaylistSearchBtn";
    searchButton.setAttribute("aria-label", "搜索歌曲、作者、专辑");
    searchButton.title = "搜索歌曲、作者、专辑";
    searchButton.textContent = "⌕";
    actions.insertBefore(searchButton, addButton);
  }

  let searchForm = $("#homePlaylistSearch");
  if (!searchForm) {
    searchForm = document.createElement("form");
    searchForm.id = "homePlaylistSearch";
    searchForm.className = "home-playlist-form hidden";
    searchForm.innerHTML = `
      <input id="homePlaylistSearchInput" type="text" autocomplete="off" placeholder="搜索歌曲、作者、专辑">
      <button type="submit">搜索</button>
      <button type="button" id="homePlaylistSearchCancel" aria-label="取消搜索">取消</button>
    `;
    importForm.parentElement?.insertBefore(searchForm, importForm);
  }

  importForm.classList.add("home-playlist-form");
  importForm.classList.remove("home-playlist-import");

  els.homePlaylistSearchBtn = searchButton;
  els.homePlaylistSearch = searchForm;
  els.homePlaylistSearchInput = $("#homePlaylistSearchInput");
  els.homePlaylistSearchCancel = $("#homePlaylistSearchCancel");
}

ensureHomePlaylistSearchUi();

function ensureSequenceControlsUi() {
  const homeQueueActions = document.querySelector(".home-queue-actions");
  if (homeQueueActions) {
    let clearButton = $("#homePlaylistClear");
    if (!clearButton) {
      clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.id = "homePlaylistClear";
      clearButton.title = "清空播放列表";
      clearButton.setAttribute("aria-label", "清空播放列表");
      clearButton.textContent = "×";
      homeQueueActions.appendChild(clearButton);
    }
    let pager = $("#homeQueuePager");
    if (!pager) {
      pager = document.createElement("div");
      pager.id = "homeQueuePager";
      pager.className = "home-queue-pager";
      pager.innerHTML = `
        <button type="button" id="homeQueuePrev" aria-label="上一页">‹</button>
        <span id="homeQueuePage">1 / 1</span>
        <button type="button" id="homeQueueNext" aria-label="下一页">›</button>
      `;
      homeQueueActions.appendChild(pager);
    }
  }

  const playlistHistoryActions = document.querySelector(".playlist-history-actions");
  if (playlistHistoryActions && !$("#playlistClear")) {
    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.id = "playlistClear";
    clearButton.className = "playlist-history-button";
    clearButton.title = "清空播放列表";
    clearButton.setAttribute("aria-label", "清空播放列表");
    clearButton.textContent = "×";
    playlistHistoryActions.appendChild(clearButton);
  }

  els.homePlaylistClear = $("#homePlaylistClear");
  els.homeQueuePager = $("#homeQueuePager");
  els.homeQueuePrev = $("#homeQueuePrev");
  els.homeQueueNext = $("#homeQueueNext");
  els.homeQueuePage = $("#homeQueuePage");
  els.playlistClear = $("#playlistClear");
}

ensureSequenceControlsUi();

let state = null;
let startedAt = 0;
let elapsedBeforePause = 0;
let audioContext;
let oscillator;
let gain;
let audio;
let activeSoundKey = "";
let lyricLines = [];
let lyricTrackKey = "";
let lyricLoadState = "idle";
let activeLyricIndex = -1;
let lyricEmptyMessage = "纯音乐";
let lyricEmptyDetails = [];
let audioErrorCount = 0;
let transientStatusTimer;
let silentFallbackTimer;
let audioWatchdogTimer;
let pendingAudioKey = "";
let nextInFlight = false;
let likeCheckKey = "";
const likeStateCache = new Map();
let audioUnlockPending = false;
let currentSongidBatch = [];
let currentSongidBatchName = "NetEase Queue";
let sequenceItems = [];
let albumReflection = null;
let memoryCoordinateUi = null;
let desktopLyricsWindow = null;
let desktopLyricsFallback = null;
let lastDesktopLyricsPublish = "";
let desktopLyricsVisible = false;
let desktopLyricsTogglePending = false;
let desktopLyricsRestoreAttempted = false;
let lastPositionReportAt = 0;
let playlistRefreshTimer = 0;
let pendingRestoreSeek = 0;
let primedAudio = null;
let sequenceRefreshToken = 0;
const audioUrlCache = new Map();
const silentPrimerSrc = "data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTAAAAAA";
const fixedNeteasePlaylistIds = ["13580387815", "7289914342", "9764261322", "6956075751"];
const fixedNeteasePlaylistNames = {
  "13580387815": "与你正当时",
  "7289914342": "不知道怎么命名",
  "9764261322": "难道逆水行舟的执念 是你刻在船舷的那一剑",
  "6956075751": "往事宛如走马灯般在眼前浮现"
};
const protectedSongidSources = new Set(["local", "daily", "personal_fm", "playlist-7067937840", ...fixedNeteasePlaylistIds.map((id) => `playlist-${id}`)]);
const playlistPageSize = 80;
const sequencePageSize = 100;
const sourceCardCacheKey = "claudio-source-cards-v2";
const audioQualityModes = ["standard", "higher", "exhigh", "lossless", "hires", "jyeffect", "sky", "jymaster"];
const audioQualityLabels = {
  standard: "标准",
  higher: "较高",
  exhigh: "极高",
  lossless: "无损",
  hires: "Hi-Res",
  jyeffect: "鲸云",
  sky: "沉浸",
  jymaster: "母带"
};
const audioQualityShort = {
  standard: "标准",
  higher: "较高",
  exhigh: "极高",
  lossless: "无损",
  hires: "高清",
  jyeffect: "鲸云",
  sky: "沉浸",
  jymaster: "母带"
};
const taskStorageKey = "claudio-home-tasks-v1";
const songidIntroStorageKey = "claudio-songid-intros-v1";
const volumeStorageKey = "claudio-volume-v1";
let playlistState = {
  query: "",
  offset: 0,
  total: 0,
  returned: 0
};
let sequenceViewState = {
  offset: 0,
  total: 0,
  returned: 0
};
let homeSequenceViewState = {
  offset: 0,
  total: 0,
  returned: 0
};

let homeTasks = loadHomeTasks();
let playlistOpenedFromHome = false;
let currentSongidSource = {};
let currentVolume = loadStoredVolume();
let volumeSyncTimer = 0;

function isLibraryLikedTrack(track = {}) {
  if (typeof track?.liked === "boolean") return track.liked;
  const playlistId = String(track?.libraryPlaylistId || "").trim();
  if (playlistId) return true;
  return Array.isArray(track?.playlists)
    && track.playlists.some((playlist) => /我的喜欢/.test(String(playlist?.name || "").trim()));
}

function isLikedCollectionSource(source = currentSongidSource) {
  return Boolean(source?.likedAll || String(source?.kind || "").trim() === "local");
}

function setLikeButtonState(isLiked) {
  if (!els.like) return;
  els.like.classList.toggle("liked", Boolean(isLiked));
  els.like.textContent = isLiked ? "♥" : "♡";
}

function primeLikeStateCache(track = {}) {
  const songId = String(neteaseSongId(track) || "").trim();
  if (!songId) return;
  if (typeof track?.liked === "boolean") {
    likeStateCache.set(songId, track.liked);
    return;
  }
  if (isLibraryLikedTrack(track)) {
    likeStateCache.set(songId, true);
    return;
  }
}

function cachedLikeState(track = {}) {
  const songId = String(neteaseSongId(track) || "").trim();
  if (!songId) return undefined;
  return likeStateCache.get(songId);
}

function format(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function trackKey(track) {
  if (!track) return "";
  return `${track.sourceId || track.id || track.url || track.title}:${track.artist || ""}`;
}

function audioKey(track) {
  return `audio:${track.sourceId || track.id || track.url}`;
}

function isEffectivelyPlaying(payload = state) {
  const track = payload?.track;
  if (!track || !payload?.playing) return false;
  const key = audioKey(track);
  if (audio && activeSoundKey === key && !audio.paused && !audio.ended) return true;
  return false;
}

function playbackPositionKey(track) {
  return String(track?.sourceId || track?.id || `${track?.title || ""}:${track?.artist || ""}`);
}

function neteaseSongId(track) {
  return track?.sourceId || track?.sourceIds?.[0] || track?.id || "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function loadHomeTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(taskStorageKey) || "null");
    if (Array.isArray(saved)) return saved;
  } catch {}
  return [
    { id: crypto.randomUUID(), text: "今晚 20:30  更新自定义歌单" },
    { id: crypto.randomUUID(), text: "周末  整理我的喜欢歌词简介" }
  ];
}

function saveHomeTasks() {
  localStorage.setItem(taskStorageKey, JSON.stringify(homeTasks));
}

function clampVolume(value) {
  return Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 1));
}

function loadStoredVolume() {
  try {
    const saved = Number(localStorage.getItem(volumeStorageKey));
    if (Number.isFinite(saved)) return clampVolume(saved);
  } catch {}
  return 1;
}

function volumeIcon(value = currentVolume) {
  return value <= 0 ? "🔇" : value < 0.45 ? "🔉" : "🔊";
}

function paintVolumeUi() {
  const percent = Math.round(clampVolume(currentVolume) * 100);
  if (els.volumeRange) els.volumeRange.value = String(percent);
  if (els.volumeValue) els.volumeValue.textContent = `${percent}%`;
  if (els.volume) {
    els.volume.textContent = volumeIcon(currentVolume);
    els.volume.classList.toggle("muted", percent === 0);
    els.volume.setAttribute("aria-label", `音量 ${percent}%`);
    els.volume.title = `音量 ${percent}%`;
  }
}

function syncVolumeState({ keepalive = false } = {}) {
  window.clearTimeout(volumeSyncTimer);
  const send = () => {
    fetch("/api/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ volume: currentVolume }),
      keepalive
    }).catch(() => {});
  };
  if (keepalive) {
    send();
    return;
  }
  volumeSyncTimer = window.setTimeout(send, 180);
}

function applyVolume(value, { persist = true, sync = false, keepalive = false } = {}) {
  currentVolume = clampVolume(value);
  if (audio) audio.volume = currentVolume;
  if (primedAudio) primedAudio.volume = currentVolume;
  paintVolumeUi();
  if (persist) {
    try {
      localStorage.setItem(volumeStorageKey, String(currentVolume));
    } catch {}
  }
  if (sync) syncVolumeState({ keepalive });
}

function toggleVolumeMenu(force) {
  if (!els.volumeMenu) return;
  const show = typeof force === "boolean" ? force : els.volumeMenu.classList.contains("hidden");
  els.volumeMenu.classList.toggle("hidden", !show);
  if (els.volume) els.volume.setAttribute("aria-expanded", show ? "true" : "false");
}

paintVolumeUi();

async function loadHomeTasksFromServer() {
  try {
    const data = await api("/api/tasks");
    homeTasks = Array.isArray(data.tasks) ? data.tasks : [];
    saveHomeTasks();
    renderHomeTasks();
  } catch {
    renderHomeTasks();
  }
}

function renderHomeTasks() {
  if (!els.homeTaskList) return;
  els.homeTaskList.innerHTML = homeTasks.length
    ? homeTasks.map((task) => `
      <article class="home-task-item">
        <span>${escapeHtml(task.text)}</span>
        <button type="button" class="home-task-delete" data-task-id="${escapeHtml(task.id)}" aria-label="删除日程" title="删除日程">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16"/>
            <path d="M9 7V5h6v2"/>
            <path d="M7 7l1 13h8l1-13"/>
            <path d="M10 11v5"/>
            <path d="M14 11v5"/>
          </svg>
        </button>
      </article>
    `).join("")
    : `<article class="home-task-item empty">暂无日程</article>`;
}

function toggleHomeTaskForm(force) {
  if (!els.homeTaskForm) return;
  const nextVisible = typeof force === "boolean"
    ? force
    : els.homeTaskForm.classList.contains("hidden");
  els.homeTaskForm.classList.toggle("hidden", !nextVisible);
  if (nextVisible) {
    els.homeTaskInput?.focus();
    els.homeTaskInput?.select?.();
  }
}

async function addHomeTaskFromInput() {
  const text = els.homeTaskInput?.value?.trim() || "";
  if (!text) {
    showTransientStatus("先写一条日程");
    return;
  }
  try {
    const data = await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ text })
    });
    homeTasks = Array.isArray(data.tasks) ? data.tasks : homeTasks;
  } catch {
    homeTasks = [{ id: crypto.randomUUID(), text }, ...homeTasks].slice(0, 8);
  }
  saveHomeTasks();
  renderHomeTasks();
  if (els.homeTaskInput) els.homeTaskInput.value = "";
  toggleHomeTaskForm(false);
  showTransientStatus("日程已添加");
}

function songidIntroKey(name = "NetEase Queue", source = {}) {
  return String(source.id || source.sourceId || source.name || name || "songid").trim();
}

function loadSongidIntros() {
  try {
    const saved = JSON.parse(localStorage.getItem(songidIntroStorageKey) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function saveSongidIntro(name, source, intro) {
  const key = songidIntroKey(name, source);
  const intros = loadSongidIntros();
  if (intro) intros[key] = intro;
  else delete intros[key];
  localStorage.setItem(songidIntroStorageKey, JSON.stringify(intros));
}

function customSongidIntro(name, source) {
  return loadSongidIntros()[songidIntroKey(name, source)] || "";
}

function canEditSongidIntro(source = {}) {
  const sourceId = String(source.id || source.playlistId || source.source || "").trim();
  if (!sourceId) return false;
  const normalized = sourceId.startsWith("playlist-") ? sourceId.replace(/^playlist-/, "") : sourceId;
  return fixedNeteasePlaylistIds.includes(sourceId) || fixedNeteasePlaylistIds.includes(normalized);
}

function ensureSongidIntroEditor() {
  let editor = document.querySelector("#songidIntroEditor");
  if (editor) return editor;
  editor = document.createElement("div");
  editor.id = "songidIntroEditor";
  editor.className = "songid-intro-editor hidden";
  editor.innerHTML = `
    <div class="songid-intro-dialog" role="dialog" aria-modal="true" aria-labelledby="songidIntroTitle">
      <h3 id="songidIntroTitle">编辑简介</h3>
      <textarea id="songidIntroTextarea" placeholder="输入歌单简介"></textarea>
      <div class="songid-intro-actions">
        <button type="button" data-cancel>取消</button>
        <button type="button" data-save>保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(editor);
  editor.addEventListener("click", (event) => {
    if (event.target === editor || event.target.closest("[data-cancel]")) closeSongidIntroEditor();
  });
  editor.querySelector("[data-save]")?.addEventListener("click", saveSongidIntroFromEditor);
  return editor;
}

function closeSongidIntroEditor() {
  document.querySelector("#songidIntroEditor")?.classList.add("hidden");
}

function openSongidIntroEditor() {
  const editor = ensureSongidIntroEditor();
  const textarea = editor.querySelector("#songidIntroTextarea");
  const previous = customSongidIntro(currentSongidBatchName, currentSongidSource)
    || currentSongidSource.summary
    || currentSongidSource.description
    || "";
  if (textarea) textarea.value = previous;
  editor.classList.remove("hidden");
  window.setTimeout(() => {
    textarea?.focus();
    textarea?.select();
  }, 0);
}

async function saveSongidIntroFromEditor() {
  const editor = ensureSongidIntroEditor();
  const textarea = editor.querySelector("#songidIntroTextarea");
  const value = String(textarea?.value || "").trim();
  saveSongidIntro(currentSongidBatchName, currentSongidSource, value);
  currentSongidSource = { ...currentSongidSource, description: value };
  if (els.songidMeta) {
    els.songidMeta.innerHTML = songidDetailMetaHtml(currentSongidBatch, currentSongidBatchName, currentSongidSource);
  }
  document.querySelector("#songid")?.classList.remove("songid-intro-expanded");
  closeSongidIntroEditor();

  const playlistId = String(currentSongidSource.id || currentSongidSource.playlistId || "").trim();
  if (!playlistId) {
    showTransientStatus(value ? "简介已保存到本地" : "简介已清空");
    return;
  }
  try {
    await api("/api/netease-playlist-desc-update", {
      method: "POST",
      body: JSON.stringify({ id: playlistId, description: value })
    });
    showTransientStatus(value ? "简介已同步到网易云" : "简介已清空并同步");
  } catch (error) {
    showTransientStatus(`本地已保存，网易云同步失败：${error.message || "接口不可用"}`);
  }
}

function renderHomeQueuePreview(data = {}) {
  if (!els.homeQueueList) return;
  const items = Array.isArray(data.items) ? data.items : [];
  if (els.homePlaylistUndo) els.homePlaylistUndo.disabled = !data.canUndoPlaylist;
  if (els.homePlaylistRedo) els.homePlaylistRedo.disabled = !data.canRedoPlaylist;
  if (els.homePlaylistClear) els.homePlaylistClear.disabled = !((data.totalCount || items.length || 0) > 1);
  const sequenceCount = data.totalCount || items.length || 0;
  homeSequenceViewState.total = sequenceCount;
  homeSequenceViewState.offset = Number(data.offset || 0);
  homeSequenceViewState.returned = Number(data.returned || items.length || 0);
  const page = Math.floor(homeSequenceViewState.offset / sequencePageSize) + 1;
  const pages = Math.max(1, Math.ceil(sequenceCount / sequencePageSize));
  if (els.homeQueueMeta) els.homeQueueMeta.textContent = `共 ${sequenceCount} 首`;
  if (els.homeQueuePage) els.homeQueuePage.textContent = `${page} / ${pages}`;
  if (els.homeQueuePrev) els.homeQueuePrev.disabled = homeSequenceViewState.offset <= 0;
  if (els.homeQueueNext) els.homeQueueNext.disabled = homeSequenceViewState.offset + homeSequenceViewState.returned >= homeSequenceViewState.total;
  if (els.homeQueuePager) els.homeQueuePager.classList.toggle("hidden", pages <= 1);
  els.homeQueueList.innerHTML = items.length
    ? items.map((track, order) => {
      const displayIndex = Number(track?.sequenceNumber ?? (homeSequenceViewState.offset + order + 1));
      const absoluteOrder = homeSequenceViewState.offset + order;
      return `
      <button type="button" class="home-queue-item ${track.source === "current" ? "active-sequence" : ""}"
        data-home-queue-index="${order}"
        data-sequence="${absoluteOrder}"
        data-sequence-number="${escapeHtml(String(displayIndex))}"
        data-sequence-source="${escapeHtml(track.source || "")}"
        data-track-index="${escapeHtml(String(track.index ?? ""))}"
        data-source-id="${escapeHtml(track.sourceId || "")}"
        data-title="${escapeHtml(track.title || "")}"
        data-artist="${escapeHtml(track.artist || "")}"
        data-album="${escapeHtml(track.album || "")}"
        data-cover="${escapeHtml(track.cover || "")}"
        data-duration="${escapeHtml(track.duration || "")}">
        <span class="home-queue-index">${escapeHtml(String(displayIndex).padStart(2, "0"))}</span>
        <span class="home-queue-copy">
          <strong>${escapeHtml(track.title || "-")}</strong>
          <small>${escapeHtml(track.artist || "")}</small>
        </span>
        ${track.source !== "current" ? `<span class="sequence-delete-button" data-delete-sequence="${order}" aria-hidden="true" title="移除">×</span>` : ""}
      </button>
    `;
    }).join("")
    : `<article class="home-queue-empty">暂无播放序列</article>`;
}

function fallbackHomePlaylists() {
  return [
    { id: "local", name: "我的喜欢", source: "local" },
    { id: "daily", name: "每日推荐", source: "daily" },
    { id: "personal_fm", name: "私人雷达", source: "personal_fm" },
    { id: "playlist-7067937840", name: "one thousand and nine hundred", source: "playlist-7067937840" },
    ...fixedNeteasePlaylistIds.map((id) => ({ id: `playlist-${id}`, name: fixedNeteasePlaylistNames[id] || `Playlist ${id}`, source: `playlist-${id}` }))
  ];
}

function renderHomePlaylists(items = fallbackHomePlaylists()) {
  if (!els.homePlaylistGrid) return;
  els.homePlaylistGrid.innerHTML = items.map((item) => {
    const cover = normalizeCoverUrl(item.cover || "");
    const style = cover ? ` style="--home-playlist-cover: url('${cover.replace(/'/g, "%27")}')"` : "";
    return `
      <button type="button" class="home-playlist-card ${cover ? "has-cover" : ""}" data-source="${escapeHtml(item.source || item.id)}"${style}>
        <strong>${escapeHtml(item.name || item.id)}</strong>
      </button>
    `;
  }).join("");
}

function renderSongidSourcePlaylists(items = fallbackHomePlaylists()) {
  const container = document.querySelector(".source-cards");
  if (!container) return;
  const playlistItems = items.filter((item) => {
    const source = String(item.source || item.id || "");
    return source === "local"
      || source === "daily"
      || source === "personal_fm"
      || source.startsWith("playlist-");
  });
  container.innerHTML = playlistItems.map((item) => {
    const source = String(item.source || item.id || "");
    const cover = normalizeCoverUrl(item.cover || "");
    const isProtected = protectedSongidSources.has(source);
    return `
      <button type="button"
        class="source-card ${source === "daily" ? "daily" : ""} ${source === "personal_fm" ? "radar" : ""} ${source.startsWith("playlist-") ? "playlist-source" : ""} ${cover ? "has-source-cover" : ""}"
        data-source="${escapeHtml(source)}"
        data-playlist-id="${escapeHtml(source.startsWith("playlist-") ? source.replace("playlist-", "") : "")}"
        data-user-playlist="${isProtected ? "0" : "1"}"
        ${cover ? `style="--source-cover: url('${cover.replace(/'/g, "%27")}')"` : ""}>
        ${cover ? `<img class="source-card-cover" src="${escapeHtml(cover)}" alt="">` : ""}
        <strong>${escapeHtml(item.name || item.id)}</strong>
      </button>
    `;
  }).join("");
  bindSourceCards();
}

function mergeHomePlaylists(primary = [], secondary = []) {
  const map = new Map();
  for (const item of [...primary, ...secondary]) {
    const key = String(item.source || item.id || "").trim();
    if (!key) continue;
    map.set(key, { ...(map.get(key) || {}), ...item, source: key });
  }
  return [...map.values()];
}

async function refreshHomePlaylists() {
  const fallback = fallbackHomePlaylists();
  renderHomePlaylists(fallback);
  renderSongidSourcePlaylists(fallback);
  try {
    const data = await api("/api/netease-source-cards");
    const cards = data.cards || [];
    const remote = cards.map((card) => ({ id: card.id, source: card.id, name: card.name, cover: card.cover }));
    const items = mergeHomePlaylists(fallback, remote);
    renderHomePlaylists(items);
    renderSongidSourcePlaylists(items);
  } catch {}
}

function toggleHomePlaylistImport(force) {
  if (!els.homePlaylistImport) return;
  const nextVisible = typeof force === "boolean"
    ? force
    : els.homePlaylistImport.classList.contains("hidden");
  if (nextVisible) els.homePlaylistSearch?.classList.add("hidden");
  els.homePlaylistImport.classList.toggle("hidden", !nextVisible);
  if (nextVisible) {
    els.homePlaylistImportInput?.focus();
    els.homePlaylistImportInput?.select?.();
  }
}

function toggleHomePlaylistSearch(force) {
  if (!els.homePlaylistSearch) return;
  const nextVisible = typeof force === "boolean"
    ? force
    : els.homePlaylistSearch.classList.contains("hidden");
  if (nextVisible) els.homePlaylistImport?.classList.add("hidden");
  els.homePlaylistSearch.classList.toggle("hidden", !nextVisible);
  if (nextVisible) {
    els.homePlaylistSearchInput?.focus();
    els.homePlaylistSearchInput?.select?.();
  }
}

async function importHomePlaylist(id) {
  const clean = String(id || "").trim();
  if (!clean) return;
  if (!/^\d{4,}$/.test(clean)) {
    showTransientStatus("歌单 ID 不正确");
    return;
  }
  try {
    const data = await api("/api/netease-source-cards", {
      method: "POST",
      body: JSON.stringify({ id: clean })
    });
    const remote = (data.cards || []).map((card) => ({ id: card.id, source: card.id, name: card.name, cover: card.cover }));
    const items = mergeHomePlaylists(fallbackHomePlaylists(), remote);
    renderHomePlaylists(items);
    renderSongidSourcePlaylists(items);
    refreshSourceCardCaptions();
    if (els.homePlaylistImportInput) els.homePlaylistImportInput.value = "";
    toggleHomePlaylistImport(false);
    showTransientStatus("已导入歌单");
  } catch (error) {
    showTransientStatus(error.message || "导入失败");
  }
}

async function runSongidSearch(query, { fromHome = false } = {}) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return;
  if (els.songidInput) els.songidInput.value = cleanQuery;
  if (fromHome) {
    openPanel("songid");
    toggleHomePlaylistSearch(false);
  }
  setSongidSource("search");
  openSongidResults("正在从网易云搜索...");
  try {
    const data = await api(`/api/netease-search?q=${encodeURIComponent(cleanQuery)}&limit=50`);
    setSongidBatch(data.recommendations || [], `搜索：${cleanQuery}`, {
      name: `搜索：${cleanQuery}`,
      cover: data.recommendations?.find?.((item) => item.cover)?.cover || "",
      trackCount: data.recommendations?.length || 0
    });
    refreshSongidResultLikes();
  } catch (error) {
    setSongidBatch([], `搜索：${cleanQuery}`);
    els.songidResults.innerHTML = `<article class="empty-list">搜索失败：${escapeHtml(error.message || "网易云搜索失败")}</article>`;
  }
}

function toggleSongidSourceImport(force) {
  if (!els.songidSourceImport) return;
  const nextVisible = typeof force === "boolean"
    ? force
    : els.songidSourceImport.classList.contains("hidden");
  els.songidSourceImport.classList.toggle("hidden", !nextVisible);
  if (nextVisible) {
    els.songidSourceImportInput?.focus();
    els.songidSourceImportInput?.select?.();
  }
}

async function importSongidPlaylist(id) {
  await importHomePlaylist(id);
  if (els.songidSourceImportInput) els.songidSourceImportInput.value = "";
  toggleSongidSourceImport(false);
}

async function deleteSongidPlaylistSource(source) {
  const clean = String(source || "");
  if (!clean.startsWith("playlist-") || protectedSongidSources.has(clean)) return;
  const id = clean.replace("playlist-", "");
  const ok = window.confirm("删除这个导入的歌单入口？");
  if (!ok) return;
  try {
    const data = await api(`/api/netease-source-cards?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const remote = (data.cards || []).map((card) => ({ id: card.id, source: card.id, name: card.name, cover: card.cover }));
    const items = mergeHomePlaylists(fallbackHomePlaylists(), remote);
    renderHomePlaylists(items);
    renderSongidSourcePlaylists(items);
    refreshSourceCardCaptions();
    showTransientStatus("已删除歌单入口");
  } catch (error) {
    showTransientStatus(error.message || "删除失败");
  }
}

function openHomePlaylistSource(source) {
  openPanel("songid");
  if (source === "local") loadLocalSongidPlaylist();
  else if (source === "daily") loadNeteaseSource("daily");
  else if (source === "personal_fm") loadNeteaseSource("personal_fm");
  else if (String(source || "").startsWith("playlist-")) loadFixedNeteasePlaylist(String(source).replace("playlist-", ""));
  else loadLocalSongidPlaylist();
}

function api(path, options) {
  return fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  }).then(async (res) => {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    return data;
  });
}

async function debugClient(event, details = {}) {
  try {
    await fetch("/api/debug-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "frontend",
        event,
        details
      }),
      keepalive: true
    });
  } catch {}
}

window.addEventListener("error", (event) => {
  debugClient("window-error", {
    message: event.message || "unknown error",
    filename: event.filename || "",
    lineno: Number(event.lineno || 0),
    colno: Number(event.colno || 0)
  });
});

window.addEventListener("unhandledrejection", (event) => {
  debugClient("unhandled-rejection", {
    reason: String(event.reason?.message || event.reason || "unknown rejection")
  });
});

function paintAudioQuality(level) {
  if (!els.quality) return;
  const value = audioQualityModes.includes(level) ? level : "lossless";
  els.quality.textContent = audioQualityShort[value] || "SQ";
  els.quality.title = `音质：${audioQualityLabels[value] || value}`;
  els.quality.dataset.level = value;
  renderQualityMenu(value);
}

function renderQualityMenu(current = els.quality?.dataset.level || "lossless") {
  if (!els.qualityMenu) return;
  els.qualityMenu.innerHTML = audioQualityModes.map((level) => `
    <button type="button" data-quality-level="${escapeHtml(level)}" class="${level === current ? "active" : ""}" role="menuitem">
      <span class="quality-check">${level === current ? "✓" : ""}</span>
      <span>${escapeHtml(audioQualityLabels[level] || level)}</span>
    </button>
  `).join("");
}

function toggleQualityMenu(force) {
  if (!els.qualityMenu) return;
  const show = typeof force === "boolean" ? force : els.qualityMenu.classList.contains("hidden");
  els.qualityMenu.classList.toggle("hidden", !show);
  if (show) {
    renderQualityMenu(els.quality?.dataset.level || "lossless");
    toggleFavoritePlaylistMenu(false);
  }
}

async function loadAudioQuality() {
  try {
    const data = await api("/api/audio-quality");
    paintAudioQuality(data.level);
  } catch {
    paintAudioQuality("lossless");
  }
}

function ensureMemoryCoordinateUi() {
  if (memoryCoordinateUi) return memoryCoordinateUi;
  const controls = document.querySelector(".controls-row-tools") || document.querySelector(".controls");
  const sequence = $("#sequenceBtn");
  let button = $("#memoryCoordinateBtn");
  if (!button && controls) {
    button = document.createElement("button");
    button.id = "memoryCoordinateBtn";
    button.className = "memory-coordinate-button";
    button.type = "button";
    button.textContent = "\u24D8";
    button.setAttribute("aria-label", "回忆坐标");
    button.title = "回忆坐标";
    if (sequence && sequence.parentElement === controls) controls.insertBefore(button, sequence);
    else controls.appendChild(button);
  }
  let modal = $("#memoryCoordinateModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "memoryCoordinateModal";
    modal.className = "memory-coordinate-modal hidden";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="memory-coordinate-sheet" role="dialog" aria-modal="true" aria-labelledby="memoryCoordinateTitle">
        <div class="memory-coordinate-bg" id="memoryCoordinateBg"></div>
        <header class="memory-coordinate-top">
          <button id="memoryCoordinateClose" type="button" aria-label="关闭">×</button>
          <h2 id="memoryCoordinateTitle">我的回忆坐标</h2>
          <span>规则</span>
        </header>
        <section class="memory-coordinate-song">
          <img id="memoryCoordinateCover" alt="">
          <div>
            <strong id="memoryCoordinateSong">-</strong>
            <span id="memoryCoordinateArtist">-</span>
          </div>
        </section>
        <section class="memory-coordinate-grid" id="memoryCoordinateGrid"></section>
        <p class="memory-coordinate-message" id="memoryCoordinateMessage"></p>
      </div>`;
    document.body.appendChild(modal);
  }
  memoryCoordinateUi = {
    button,
    modal,
    close: $("#memoryCoordinateClose"),
    bg: $("#memoryCoordinateBg"),
    cover: $("#memoryCoordinateCover"),
    song: $("#memoryCoordinateSong"),
    artist: $("#memoryCoordinateArtist"),
    grid: $("#memoryCoordinateGrid"),
    message: $("#memoryCoordinateMessage")
  };
  if (memoryCoordinateUi.button) {
    memoryCoordinateUi.button.textContent = "\u24D8";
    memoryCoordinateUi.button.setAttribute("aria-label", "回忆坐标");
    memoryCoordinateUi.button.title = "回忆坐标";
  }
  memoryCoordinateUi.button?.addEventListener("click", openMemoryCoordinate);
  memoryCoordinateUi.close?.addEventListener("click", closeMemoryCoordinate);
  memoryCoordinateUi.modal?.addEventListener("click", (event) => {
    if (event.target === memoryCoordinateUi.modal) closeMemoryCoordinate();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !memoryCoordinateUi.modal.classList.contains("hidden")) closeMemoryCoordinate();
  });
  return memoryCoordinateUi;
}

function closeMemoryCoordinate() {
  const ui = ensureMemoryCoordinateUi();
  ui.modal.classList.add("hidden");
  ui.modal.setAttribute("aria-hidden", "true");
}

function formatMemoryDate(value, fallback = "-") {
  if (!value) return fallback;
  const text = String(value);
  const match = text.match(/^(\d{4})[-.](\d{2})[-.](\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : text.slice(0, 10).replaceAll("-", ".");
}

function firstListenSeasonLabel(first) {
  return [first?.season, first?.period].filter(Boolean).join("的") || "第一次";
}

function memoryPeriodClass(first) {
  const text = `${first?.period || ""} ${first?.timeDesc || ""} ${first?.date || ""}`.toLowerCase();
  const hour = Number(String(first?.time || first?.date || "").match(/(\d{1,2}):\d{2}/)?.[1]);
  if (text.includes("night") || text.includes("晚上") || text.includes("夜") || hour >= 18 || hour < 5) return "is-night";
  if (text.includes("afternoon") || text.includes("下午") || hour >= 12) return "is-afternoon";
  if (text.includes("morning") || text.includes("上午") || text.includes("清晨") || hour >= 5) return "is-morning";
  return "is-day";
}

function renderMemoryCoordinate(data) {
  const ui = ensureMemoryCoordinateUi();
  const track = state?.track || {};
  const info = data?.songInfoDto || {};
  const first = data?.musicFirstListenDto || {};
  const total = data?.musicTotalPlayDto || {};
  const most = data?.musicPlayMostDto || {};
  const like = data?.musicLikeSongDto || {};
  const frequent = data?.musicFrequentListenDto || {};
  const cover = String(info.coverUrl || track.cover || "").replace(/^http:/, "https:");
  ui.bg.style.backgroundImage = cover ? `url("${cover}")` : "";
  if (cover) ui.cover.src = cover;
  else ui.cover.removeAttribute("src");
  ui.song.textContent = info.songName || track.title || "-";
  ui.artist.textContent = info.singer || track.artist || "-";
  const maxYear = total.maxPlayTimes?.[0]?.year || "";
  const maxTimes = total.maxPlayTimes?.[0]?.times;
  const maxTimesText = Number.isFinite(Number(maxTimes)) ? `${maxTimes}次` : "";
  const redTitle = like.like ? formatMemoryDate(like.redTime || like.redTimeStamp) : "暂无红心";
  const listenRange = frequent.startTime && frequent.endTime ? `${frequent.startTime}:00-${frequent.endTime}:00` : "-";
  const firstTimeText = first.time || String(first.date || "").match(/\d{1,2}:\d{2}/)?.[0] || "";
  const cards = [
    { type: "first", label: "第一次听", value: firstListenSeasonLabel(first), sub: formatMemoryDate(first.date || first.listenTime), time: firstTimeText, periodClass: memoryPeriodClass(first) },
    { type: "total", label: "累计播放", value: `${total.playCount ?? 0}次`, sub: total.text || "", extra: maxTimesText, year: maxYear },
    { label: "播放最多的一天", value: formatMemoryDate(most.date || most.timestamp), sub: most.text || "" },
    { label: "红心时间", value: redTitle, sub: like.redDesc || like.text || "红心歌曲开启我们的故事" },
    { label: "相遇天数", value: `${first.meetDuration || "-"}天`, sub: first.meetDurationDesc || "" },
    { label: "常听时间", value: listenRange, sub: frequent.describe || "" }
  ];
  ui.grid.innerHTML = cards.map((card) => `
    <article class="memory-coordinate-card ${card.type ? `is-${card.type}` : ""} ${card.type === "total" ? "memory-total-card" : ""}">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      ${card.sub ? `<small>${escapeHtml(card.sub)}</small>` : ""}
      ${card.type === "first" ? `<div class="memory-orbit ${escapeHtml(card.periodClass || "is-day")}"><i></i><b>${escapeHtml(card.time || "-")}</b></div>` : ""}
      ${card.type === "total" && card.extra ? `<b class="memory-curve-count">${escapeHtml(card.extra)}</b>` : ""}
      ${card.type === "total" ? `<div class="memory-curve"><i></i><em>${escapeHtml(card.year ? `${card.year}年` : "")}</em></div>` : ""}
    </article>
  `).join("");
  ui.message.textContent = "";
}

async function openMemoryCoordinate() {
  const ui = ensureMemoryCoordinateUi();
  const songId = neteaseSongId(state?.track);
  ui.modal.classList.remove("hidden");
  ui.modal.setAttribute("aria-hidden", "false");
  ui.message.textContent = songId ? "正在读取回忆坐标..." : "当前歌曲没有网易云 songId";
  ui.grid.innerHTML = "";
  if (!songId) return;
  try {
    const data = await api(`/api/netease-memory-coordinate?id=${encodeURIComponent(songId)}`);
    const payload = data.data || {};
    if (!Object.keys(payload).length) {
      ui.message.textContent = "这首歌暂时没有回忆坐标数据。";
      return;
    }
    renderMemoryCoordinate(payload);
  } catch (error) {
    ui.message.textContent = "回忆坐标读取失败。";
  }
}

function showTransientStatus(text) {
  window.clearTimeout(transientStatusTimer);
  if (!els.signal) return;
  els.signal.textContent = text;
  transientStatusTimer = window.setTimeout(() => {
    els.signal.textContent = state?.playing ? "ON AIR" : "READY";
  }, 3000);
}

function currentElapsed() {
  const currentTrackKey = audioKey(state?.track);
  if (audio && activeSoundKey === currentTrackKey) return audio.currentTime || 0;
  if (!isEffectivelyPlaying(state)) return elapsedBeforePause;
  return elapsedBeforePause + (Date.now() - startedAt) / 1000;
}

function savedPositionForPayload(payload) {
  const seconds = Number(payload?.positionSeconds || 0);
  const key = String(payload?.positionTrackKey || "");
  const track = payload?.track;
  if (!Number.isFinite(seconds) || seconds <= 0 || !track) return 0;
  if (key && key !== playbackPositionKey(track)) return 0;
  const duration = Number(track.duration || 0);
  if (duration > 12 && seconds >= duration - 4) return 0;
  return Math.max(0, Math.min(duration || seconds, seconds));
}

function seekAudioTo(seconds, target = audio) {
  if (!target || !Number.isFinite(seconds) || seconds <= 0) return;
  const apply = () => {
    try {
      target.currentTime = seconds;
      if (target === audio) pendingRestoreSeek = 0;
    } catch {}
  };
  if (Number.isFinite(target.duration) && target.duration > 0) apply();
  else target.addEventListener("loadedmetadata", apply, { once: true });
}

function reportPlaybackPosition({ force = false, keepalive = false } = {}) {
  if (!state?.track) return;
  const now = Date.now();
  if (!force && now - lastPositionReportAt < 3500) return;
  lastPositionReportAt = now;
  const seconds = currentElapsed();
  if (!Number.isFinite(seconds) || seconds < 0) return;
  const body = JSON.stringify({
    positionSeconds: seconds,
    positionTrackKey: playbackPositionKey(state.track)
  });
  fetch("/api/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive
  }).catch(() => {});
}

function updateClock() {
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
  if (els.weather) els.weather.dataset.time = time;
  if (state?.weather) updateWeatherLabel(state.weather);
  else updateWeatherLabel(null);
}

function updateWeatherLabel(weather) {
  const time = els.weather?.dataset.time || new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
  const hour = Number(String(time).split(":")[0]);
  const isNight = Number.isFinite(hour) ? (hour >= 18 || hour < 6) : false;
  const weatherIconSvg = (kind = "default") => {
    if (kind === "sunny") {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"></circle><path d="M12 2.8v2.4M12 18.8v2.4M4.8 12H2.4M21.6 12h-2.4M5.9 5.9 4.2 4.2M19.8 19.8l-1.7-1.7M18.1 5.9l1.7-1.7M5.9 18.1l-1.7 1.7"></path></svg>`;
    }
    if (kind === "night-clear") {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.7 3.3a7.9 7.9 0 1 0 5 13.8 8.7 8.7 0 1 1-5-13.8Z"></path><path d="M17.8 5.2v1.4M17.8 10.1v1.4M15.3 7.6h-1.4M21.7 7.6h-1.4"></path></svg>`;
    }
    if (kind === "rain") {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 18.2a4.7 4.7 0 1 1 .8-9.3 5.7 5.7 0 0 1 10.7 2 3.5 3.5 0 0 1-.5 7.1H7.5Z"></path><path d="M9 19.2l-1 2.2M13 19.2l-1 2.2M17 19.2l-1 2.2"></path></svg>`;
    }
    if (kind === "snow") {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 17.8a4.7 4.7 0 1 1 .8-9.3 5.7 5.7 0 0 1 10.7 2 3.5 3.5 0 0 1-.5 7.1H7.5Z"></path><path d="M10 19.2v3.2M8.5 20.4l3 1.8M11.5 20.4l-3 1.8M15 19.2v3.2M13.5 20.4l3 1.8M16.5 20.4l-3 1.8"></path></svg>`;
    }
    if (kind === "cloudy") {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.2" cy="8.3" r="2.8"></circle><path d="M8.2 3.2v1.5M8.2 11.9v1.5M3.1 8.3h1.5M11.8 8.3h1.5M4.6 4.7l1.1 1.1M10.7 10.8l1.1 1.1M11.8 4.7l-1.1 1.1"></path><path d="M8.4 18.2a4.5 4.5 0 1 1 .8-8.9 5.3 5.3 0 0 1 9.9 1.8 3.2 3.2 0 0 1-.5 7.1H8.4Z"></path></svg>`;
    }
    if (kind === "night-cloudy") {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.6 5a5 5 0 0 0 3.5 7.5 5.2 5.2 0 0 1-5.7-.7A5.1 5.1 0 0 1 9.6 5Z"></path><path d="M8.4 18.2a4.5 4.5 0 1 1 .8-8.9 5.3 5.3 0 0 1 9.9 1.8 3.2 3.2 0 0 1-.5 7.1H8.4Z"></path></svg>`;
    }
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="1.7"></circle><path d="M12 3.5v3M12 17.5v3M4.5 12h3M16.5 12h3M6.5 6.5l2.1 2.1M15.4 15.4l2.1 2.1M17.5 6.5l-2.1 2.1M8.6 15.4l-2.1 2.1"></path></svg>`;
  };
  const renderWeather = ({ icon = "default", text = "天气", temp = "", title = "天气" } = {}) => `
    <span class="panel-time">${escapeHtml(time)}</span>
    <span class="weather-badge" title="${escapeHtml(title)}">
      <span class="weather-icon weather-icon-${escapeHtml(icon)}" aria-hidden="true">${weatherIconSvg(icon)}</span>
      <span class="weather-text">${escapeHtml(text)}</span>
      ${temp ? `<span class="weather-temp">${escapeHtml(temp)}</span>` : ""}
    </span>
  `;
  if (!weather) {
    const html = renderWeather();
    if (els.weather) els.weather.innerHTML = html;
    if (els.homeWeather) els.homeWeather.innerHTML = html;
    return;
  }
  const rawText = String(weather.text || "").replace(/^当前位置\s*/, "").trim();
  const raw = rawText.toLowerCase();
  let text = "天气";
  let icon = "default";
  if (/晴/.test(rawText) || /clear|sunny|mainly clear/.test(raw)) {
    text = "晴";
    icon = isNight ? "night-clear" : "sunny";
  } else if (/多云/.test(rawText) || /clouds|cloudy|partly cloudy/.test(raw)) {
    text = "多云";
    icon = isNight ? "night-cloudy" : "cloudy";
  } else if (/阴/.test(rawText) || /overcast/.test(raw)) {
    text = "阴";
    icon = isNight ? "night-cloudy" : "cloudy";
  } else if (/雷/.test(rawText) || /thunderstorm/.test(raw)) {
    text = "雷雨";
    icon = "rain";
  } else if (/阵雨/.test(rawText) || /shower/.test(raw)) {
    text = "阵雨";
    icon = "rain";
  } else if (/小雨/.test(rawText) || /drizzle/.test(raw)) {
    text = "小雨";
    icon = "rain";
  } else if (/大雨/.test(rawText) || /heavy rain|violent shower|heavy shower/.test(raw)) {
    text = "大雨";
    icon = "rain";
  } else if (/雨/.test(rawText) || /rain|storm/.test(raw)) {
    text = "雨";
    icon = "rain";
  } else if (/大雪/.test(rawText) || /heavy snow/.test(raw)) {
    text = "大雪";
    icon = "snow";
  } else if (/雪/.test(rawText) || /snow|sleet/.test(raw)) {
    text = "雪";
    icon = "snow";
  } else if (/雾/.test(rawText) || /mist|fog|rime fog/.test(raw)) {
    text = "雾";
    icon = "cloudy";
  } else if (/霾/.test(rawText) || /haze/.test(raw)) {
    text = "霾";
    icon = "default";
  } else if (rawText) {
    text = rawText;
  }
  const temp = Number.isFinite(Number(weather.temp)) ? `${Math.round(Number(weather.temp))}°C` : "";
  const html = renderWeather({ icon, text, temp, title: temp ? `${text} ${temp}` : text });
  if (els.weather) els.weather.innerHTML = html;
  if (els.homeWeather) els.homeWeather.innerHTML = html;
}

function toneFrequency(track) {
  const seed = [...`${track.title}${track.artist}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return 164 + (seed % 160);
}

function startTone(track) {
  startSilentFallback(track);
}

function stopTone() {
  if (oscillator) {
    oscillator.stop();
    oscillator.disconnect();
  }
  oscillator = null;
  gain = null;
}

function isCurrentAudioInstance(instance, key = activeSoundKey) {
  return Boolean(instance) && audio === instance && activeSoundKey === key;
}

function hasAudibleCurrentAudio(key = activeSoundKey) {
  return Boolean(
    audio &&
    activeSoundKey === key &&
    !audio.paused &&
    !audio.ended &&
    (audio.currentSrc || audio.src) &&
    audio.readyState > 0
  );
}

window.__claudioAudioDebug = () => {
  const currentTrack = state?.track || null;
  return {
    statePlaying: Boolean(state?.playing),
    effectivePlaying: isEffectivelyPlaying(state),
    audioUnlockPending,
    activeSoundKey,
    pendingAudioKey,
    trackKey: currentTrack ? audioKey(currentTrack) : "",
    title: currentTrack?.title || "",
    sourceId: currentTrack?.sourceId || currentTrack?.id || "",
    elapsedBeforePause,
    startedAt,
    currentVolume,
    audio: audio ? {
      src: audio.currentSrc || audio.src || "",
      paused: audio.paused,
      ended: audio.ended,
      readyState: audio.readyState,
      networkState: audio.networkState,
      currentTime: audio.currentTime,
      duration: audio.duration,
      muted: audio.muted,
      volume: audio.volume,
      error: audio.error ? {
        code: audio.error.code,
        message: audio.error.message || ""
      } : null
    } : null
  };
};

async function primeAudioPlayback() {
  const instance = primedAudio || audio || new Audio();
  primedAudio = instance;
  instance.volume = currentVolume;
  instance.preload = "auto";
  instance.muted = true;
  instance.onended = null;
  instance.ontimeupdate = null;
  instance.onerror = null;
  if (instance.src !== silentPrimerSrc) instance.src = silentPrimerSrc;
  try {
    await instance.play();
  } catch {}
  try {
    instance.pause();
    instance.currentTime = 0;
  } catch {}
  instance.muted = false;
  try {
    instance.removeAttribute("src");
    instance.load();
  } catch {}
  return instance;
}

function prepareAudioInstance(src = "") {
  const instance = primedAudio || new Audio();
  primedAudio = null;
  if (audio && audio !== instance) stopAudio(audio);
  audio = instance;
  instance.onended = null;
  instance.ontimeupdate = null;
  instance.onerror = null;
  instance.volume = currentVolume;
  instance.preload = "auto";
  instance.muted = false;
  try {
    instance.pause();
  } catch {}
  if (src) instance.src = src;
  else instance.removeAttribute("src");
  return instance;
}

function isAutoplayBlocked(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || "");
  return name === "NotAllowedError" || /play\(\)|autoplay|user gesture|permission/i.test(message);
}

function audioUrlCacheKey(track) {
  const songId = track?.sourceId || track?.id || "";
  return songId ? `${songId}:${state?.audioQuality || ""}` : "";
}

async function prefetchAudioUrl(track) {
  const songId = track?.sourceId || track?.id || "";
  const cacheKey = audioUrlCacheKey(track);
  if (!songId || !cacheKey || audioUrlCache.has(cacheKey)) return;
  try {
    const data = await api(`/api/song-url?id=${encodeURIComponent(songId)}`);
    if (!data?.url) return;
    audioUrlCache.set(cacheKey, {
      url: String(data.url || ""),
      level: data.level || "",
      type: data.type || "",
      fetchedAt: Date.now()
    });
  } catch {}
}

async function playPreparedAudioUrl(track, safeUrl, expectedKey, endpoint, meta = {}) {
  stopAudio();
  const instance = prepareAudioInstance(safeUrl);
  seekAudioTo(pendingRestoreSeek || elapsedBeforePause, instance);
  instance.onended = () => handleAudioEnded(track, instance, expectedKey);
  instance.ontimeupdate = () => {
    if (!isCurrentAudioInstance(instance, expectedKey)) return;
    updateLyric(instance.currentTime);
  };
  instance.onerror = () => {
    if (!isCurrentAudioInstance(instance, expectedKey)) return;
    showTransientStatus("AUDIO FALLBACK");
    debugClient("audio:element-error", {
      title: track?.title || "",
      sourceId: track?.sourceId || track?.id || "",
      code: instance.error?.code || 0,
      message: instance.error?.message || ""
    });
    stopAudio(instance);
    startTone(track);
  };
  await instance.play();
  if (!isCurrentAudioInstance(instance, expectedKey)) return false;
  armAudioWatchdog(track, instance, expectedKey, endpoint);
  showTransientStatus("NCM LINK LIVE");
  debugClient("audio:play-success", {
    title: track?.title || "",
    sourceId: track?.sourceId || track?.id || "",
    level: meta.level || "",
    readyState: instance.readyState
  });
  return true;
}

function markAudioUnlockPending() {
  audioUnlockPending = true;
  showTransientStatus("点击播放恢复声音");
}

async function resumeAudioAfterGesture() {
  if (!state?.playing || !state.track) return false;
  audioContext?.resume?.().catch(() => {});
  if (audio && audio.paused && (audio.currentSrc || audio.src)) {
    try {
      await audio.play();
      audioUnlockPending = false;
      showTransientStatus("NCM LINK LIVE");
      return true;
    } catch (error) {
      if (isAutoplayBlocked(error)) {
        markAudioUnlockPending();
        return false;
      }
    }
  }
  audioUnlockPending = false;
  startAudio(state.track);
  return true;
}

function startAudio(track) {
  const key = `audio:${track.sourceId || track.id || track.url}`;
  debugClient("audio:start", {
    title: track?.title || "",
    sourceId: track?.sourceId || track?.id || "",
    key,
    pendingAudioKey,
    activeSoundKey,
    hasAudio: Boolean(audio),
    audioPaused: audio ? audio.paused : null,
    audioReadyState: audio ? audio.readyState : null
  });
  if (pendingAudioKey === key) {
    debugClient("audio:start-skipped-pending", { key });
    return Promise.resolve(false);
  }
  if (activeSoundKey === key && hasAudibleCurrentAudio(key)) {
    debugClient("audio:start-skipped-active", { key });
    return Promise.resolve(true);
  }
  activeSoundKey = key;
  stopTone();
  stopAudio();
  audioErrorCount = 0;
  paintDesktopLyrics();
  const songId = track.sourceId || track.id;
  const src = songId ? `/api/song-url?id=${encodeURIComponent(songId)}` : track.url;
  if (songId) {
    const cached = audioUrlCache.get(audioUrlCacheKey(track));
    if (cached?.url) {
      return playPreparedAudioUrl(track, cached.url, key, src, cached).catch((error) => {
        debugClient("audio:play-error", {
          title: track?.title || "",
          sourceId: track?.sourceId || track?.id || "",
          message: error?.message || "unknown error",
          name: error?.name || "",
          cached: true
        });
        if (isAutoplayBlocked(error)) {
          markAudioUnlockPending();
          return false;
        }
        audioUrlCache.delete(audioUrlCacheKey(track));
        return refreshAudioUrl(track, src, key);
      });
    }
    return refreshAudioUrl(track, src, key);
  }
  const instance = prepareAudioInstance(track.url);
  seekAudioTo(pendingRestoreSeek || elapsedBeforePause, instance);
  instance.onended = () => handleAudioEnded(track, instance, key);
  instance.ontimeupdate = () => {
    if (!isCurrentAudioInstance(instance, key)) return;
    updateLyric(instance.currentTime);
  };
  instance.onerror = () => {
    if (!isCurrentAudioInstance(instance, key)) return;
    audioErrorCount += 1;
    if (songId && audioErrorCount === 1) {
      refreshAudioUrl(track, src, key);
      return;
    }
    showTransientStatus("AUDIO FALLBACK");
    stopAudio(instance);
    startTone(track);
  };
  return instance.play().then(() => true).catch((error) => {
    if (!isCurrentAudioInstance(instance, key)) return;
    if (isAutoplayBlocked(error)) {
      markAudioUnlockPending();
      return false;
    }
    audioErrorCount += 1;
    if (songId && audioErrorCount === 1) {
      return refreshAudioUrl(track, src, key);
    }
    showTransientStatus("AUDIO BLOCKED");
    stopAudio(instance);
    startTone(track);
    return false;
  });
}

async function refreshAudioUrl(track, endpoint, expectedKey = activeSoundKey) {
  pendingAudioKey = expectedKey;
  try {
    debugClient("audio:url-fetch", {
      title: track?.title || "",
      sourceId: track?.sourceId || track?.id || "",
      endpoint,
      expectedKey
    });
    const data = await api(endpoint);
    if (!data.url) throw new Error("empty url");
    const cacheKey = audioUrlCacheKey(track);
    if (cacheKey) {
      audioUrlCache.set(cacheKey, {
        url: String(data.url || ""),
        level: data.level || "",
        type: data.type || "",
        fetchedAt: Date.now()
      });
    }
    debugClient("audio:url-ready", {
      title: track?.title || "",
      sourceId: track?.sourceId || track?.id || "",
      level: data.level || "",
      type: data.type || "",
      expectedKey
    });
    if (activeSoundKey !== expectedKey) return;
    const safeUrl = String(data.url || "");
    return playPreparedAudioUrl(track, safeUrl, expectedKey, endpoint, data);
  } catch (error) {
    if (activeSoundKey !== expectedKey) return;
    debugClient("audio:play-error", {
      title: track?.title || "",
      sourceId: track?.sourceId || track?.id || "",
      message: error?.message || "unknown error",
      name: error?.name || ""
    });
    if (isAutoplayBlocked(error)) {
      markAudioUnlockPending();
      return false;
    }
    showTransientStatus("NO NCM URL");
    stopAudio();
    startTone(track);
    return false;
  } finally {
    if (pendingAudioKey === expectedKey) pendingAudioKey = "";
  }
}

function armAudioWatchdog(track, instance = audio, expectedKey = activeSoundKey, endpoint = "") {
  window.clearTimeout(audioWatchdogTimer);
  const startAt = Number(instance?.currentTime || 0);
  audioWatchdogTimer = window.setTimeout(() => {
    if (!isCurrentAudioInstance(instance, expectedKey)) return;
    if (!state?.playing || instance.paused || instance.ended) return;
    const progressed = Number(instance.currentTime || 0) - startAt;
    if (progressed > 0.35) return;
    audioErrorCount += 1;
    showTransientStatus("AUDIO STALLED · RETRY");
    if (endpoint && audioErrorCount <= 2) {
      refreshAudioUrl(track, endpoint, expectedKey);
      return;
    }
    startSilentFallback(track);
  }, 7000);
}

async function handleAudioEnded(track, instance = audio, expectedKey = activeSoundKey) {
  if (nextInFlight) return;
  if (instance && !isCurrentAudioInstance(instance, expectedKey)) return;
  const expected = Number(track.duration || 0);
  const played = Number(instance?.currentTime || currentElapsed() || 0);
  const mediaDuration = Number(instance?.duration || 0);
  const hasExpectedEnd = expected > 0;
  const hasMediaEnd = Number.isFinite(mediaDuration) && mediaDuration > 0;
  const mediaMatchesExpected = !hasExpectedEnd || mediaDuration >= expected * 0.9;
  const reachedShortMediaEnd = hasMediaEnd && played >= Math.max(0, mediaDuration - 1.2);
  const reachedExpectedEnd = hasExpectedEnd && played >= Math.max(0, Math.min(expected - 3, expected * 0.96));
  const reachedMediaEnd = hasMediaEnd && mediaMatchesExpected && played >= Math.max(0, mediaDuration - 2);
  if (reachedShortMediaEnd && hasExpectedEnd && mediaDuration < expected * 0.9) {
    debugClient("audio:short-media-ended", {
      title: track?.title || "",
      sourceId: track?.sourceId || track?.id || "",
      played,
      mediaDuration,
      expected
    });
    nextTrack("ended");
    return;
  }
  if ((hasExpectedEnd || hasMediaEnd) && !reachedExpectedEnd && !reachedMediaEnd) {
    elapsedBeforePause = played;
    showTransientStatus("AUDIO ENDED EARLY");
    const payload = await api("/api/state", {
      method: "POST",
      body: JSON.stringify({
        playing: false,
        positionSeconds: played,
        positionTrackKey: playbackPositionKey(track)
      })
    });
    paint(payload);
    return;
  }
  nextTrack("ended");
}

function stopAudio(target = audio) {
  window.clearTimeout(audioWatchdogTimer);
  audioWatchdogTimer = null;
  if (target) {
    target.onended = null;
    target.ontimeupdate = null;
    target.onerror = null;
    target.pause();
    target.removeAttribute("src");
    target.load();
  }
  if (audio === target) audio = null;
}

function stopSound() {
  activeSoundKey = "";
  pendingAudioKey = "";
  stopTone();
  stopAudio();
  stopSilentFallback();
}

function pauseSound() {
  stopTone();
  if (audio) audio.pause();
  stopSilentFallback();
}

function startSilentFallback(track) {
  const key = `silent:${track.sourceId || track.id || track.title}`;
  if (activeSoundKey === key) return;
  activeSoundKey = key;
  stopAudio();
  stopTone();
  stopSilentFallback();
  showTransientStatus("当前歌曲暂时无法播放");
  silentFallbackTimer = window.setTimeout(() => {
    if (!state?.playing || activeSoundKey !== key) return;
    api("/api/state", {
      method: "POST",
      body: JSON.stringify({
        playing: false,
        positionSeconds: Number(elapsedBeforePause || currentElapsed() || 0),
        positionTrackKey: playbackPositionKey(track)
      })
    }).then((payload) => {
      paint(payload);
    }).catch(() => {});
  }, 2500);
}

function stopSilentFallback() {
  window.clearTimeout(silentFallbackTimer);
  silentFallbackTimer = null;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.96;
  utterance.pitch = 0.92;
  speechSynthesis.speak(utterance);
}

function parseLyrics(raw) {
  return String(raw || "").split("\n").flatMap((line) => {
    const matches = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    const text = line.replace(/\[[^\]]+\]/g, "").trim();
    if (!matches.length || !text) return [];
    return matches.map((match) => ({
      time: Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || 0}`),
      text
    }));
  }).sort((a, b) => a.time - b.time);
}

function mergeTranslatedLyrics(lines, translations) {
  if (!translations.length) return lines;
  return lines.map((line) => {
    const translated = translations.find((item) => Math.abs(item.time - line.time) < 0.35);
    return translated?.text && translated.text !== line.text
      ? { ...line, translation: translated.text }
      : line;
  });
}

function isInstrumentalCreditLine(text) {
  const normalized = String(text || "")
    .replace(/\s+/g, "")
    .replace(/[，、]/g, ",")
    .replace(/[：:]/g, ":")
    .toLowerCase();
  if (!normalized) return true;
  if (/^(作词|作曲|编曲|制作人|歌词贡献|歌词制作|lrc|lyricist|composer|arranger|producer):?/.test(normalized)) return true;
  if (/^(无|暂无|暂无歌词|纯音乐|纯音乐,?请欣赏|instrumental)$/.test(normalized)) return true;
  return false;
}

function isInstrumentalCreditOnly(lines) {
  return Boolean(lines?.length) && lines.every((line) => isInstrumentalCreditLine(line.text));
}

function desktopLyricsDocument() {
  if (desktopLyricsWindow && !desktopLyricsWindow.closed) return desktopLyricsWindow.document;
  if (desktopLyricsFallback && !desktopLyricsFallback.closed) return desktopLyricsFallback.document;
  return null;
}

function desktopLyricText(index = activeLyricIndex) {
  const current = lyricLines[index]?.text || els.currentLyric?.textContent || "纯音乐";
  const translation = lyricLines[index]?.translation || "";
  const next = lyricLines[index + 1]?.text || els.nextLyric?.textContent || "";
  return { current, translation, next };
}

function publishDesktopLyrics(line) {
  const payload = {
    title: state?.track?.title || "Claudio AI Radio",
    artist: state?.track?.artist || "",
    current: line.current || "纯音乐",
    translation: line.translation || "",
    next: line.next || ""
  };
  const key = JSON.stringify(payload);
  if (key === lastDesktopLyricsPublish) return;
  lastDesktopLyricsPublish = key;
  fetch("/api/desktop-lyrics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: key,
    keepalive: true
  }).catch(() => {});
}

function paintDesktopLyrics() {
  const line = desktopLyricText();
  publishDesktopLyrics(line);
  const doc = desktopLyricsDocument();
  if (!doc) return;
  const title = doc.querySelector("#desktopLyricTitle");
  const artist = doc.querySelector("#desktopLyricArtist");
  const current = doc.querySelector("#desktopLyricCurrent");
  const translation = doc.querySelector("#desktopLyricTranslation");
  const next = doc.querySelector("#desktopLyricNext");
  if (title) title.textContent = state?.track?.title || "Claudio AI Radio";
  if (artist) artist.textContent = state?.track?.artist || "";
  if (current) current.textContent = line.current || "纯音乐";
  if (translation) {
    translation.textContent = line.translation || "";
    translation.hidden = !line.translation;
  }
  if (next) next.textContent = line.next || "";
}

function writeDesktopLyricsShell(doc) {
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Claudio Lyrics</title><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;color:#f7f1e8;font-family:"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif}
body{box-sizing:border-box;padding:14px 24px;display:grid;grid-template-rows:1fr auto;background:transparent;border:0;outline:0}
header{display:none}
#desktopLyricTitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:740}
#desktopLyricArtist{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:rgba(247,241,232,.58)}
main{min-width:0;display:grid;place-items:center;text-align:center}
#desktopLyricCurrent{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(24px,7vw,42px);line-height:1.18;font-weight:850;-webkit-text-stroke:.35px rgba(0,0,0,.42);text-shadow:0 2px 4px rgba(0,0,0,.95),0 8px 20px rgba(0,0,0,.82),0 0 34px rgba(0,0,0,.68)}
#desktopLyricTranslation{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:8px;font-size:clamp(14px,3.4vw,20px);line-height:1.32;color:rgba(247,241,232,.72);-webkit-text-stroke:.2px rgba(0,0,0,.35);text-shadow:0 2px 4px rgba(0,0,0,.88),0 8px 18px rgba(0,0,0,.72)}
#desktopLyricNext{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:rgba(247,241,232,.48);text-align:center;text-shadow:0 2px 4px rgba(0,0,0,.8),0 6px 16px rgba(0,0,0,.62)}
</style></head><body><header><div id="desktopLyricTitle">Claudio AI Radio</div><div id="desktopLyricArtist"></div></header><main><div><div id="desktopLyricCurrent">纯音乐</div><div id="desktopLyricTranslation" hidden></div></div></main><footer id="desktopLyricNext"></footer></body></html>`);
  doc.close();
  paintDesktopLyrics();
}

async function openDesktopLyrics() {
  if (state?.track) {
    const key = state.track.sourceId || state.track.id || state.track.title;
    if (lyricTrackKey !== key || lyricLoadState === "idle" || lyricLoadState === "error") {
      await loadLyrics(state.track, { force: lyricLoadState === "error" });
    }
    syncLyricsToPlayback({ force: true, behavior: "auto" });
  }
  const line = desktopLyricText();
  publishDesktopLyrics(line);
  try {
    const result = await api("/api/desktop-lyrics/open", { method: "POST" });
    if (result?.ok) {
      desktopLyricsVisible = true;
      els.desktopLyrics?.classList.add("active");
      return;
    }
  } catch {}
  try {
    if ("documentPictureInPicture" in window) {
      desktopLyricsWindow = await window.documentPictureInPicture.requestWindow({ width: 760, height: 170 });
      desktopLyricsWindow.addEventListener("pagehide", () => {
        desktopLyricsWindow = null;
        desktopLyricsVisible = false;
        els.desktopLyrics?.classList.remove("active");
      });
      writeDesktopLyricsShell(desktopLyricsWindow.document);
      desktopLyricsVisible = true;
      els.desktopLyrics?.classList.add("active");
      return;
    }
  } catch {
    desktopLyricsWindow = null;
  }
  desktopLyricsFallback = window.open("", "ClaudioDesktopLyrics", "width=760,height=170,menubar=no,toolbar=no,location=no,status=no");
  if (desktopLyricsFallback) {
    writeDesktopLyricsShell(desktopLyricsFallback.document);
    desktopLyricsVisible = true;
    els.desktopLyrics?.classList.add("active");
  }
}

async function closeDesktopLyrics() {
  try {
    await api("/api/desktop-lyrics/close", { method: "POST" });
  } catch {}
  try {
    if (desktopLyricsWindow && !desktopLyricsWindow.closed) desktopLyricsWindow.close();
  } catch {}
  try {
    if (desktopLyricsFallback && !desktopLyricsFallback.closed) desktopLyricsFallback.close();
  } catch {}
  desktopLyricsWindow = null;
  desktopLyricsFallback = null;
  desktopLyricsVisible = false;
  els.desktopLyrics?.classList.remove("active");
}

async function toggleDesktopLyrics() {
  if (desktopLyricsTogglePending) return;
  desktopLyricsTogglePending = true;
  els.desktopLyrics?.setAttribute("aria-busy", "true");
  const localWindowOpen = Boolean((desktopLyricsWindow && !desktopLyricsWindow.closed) || (desktopLyricsFallback && !desktopLyricsFallback.closed));
  try {
    if (desktopLyricsVisible || localWindowOpen) {
      await closeDesktopLyrics();
      return;
    }
    await openDesktopLyrics();
  } finally {
    desktopLyricsTogglePending = false;
    els.desktopLyrics?.removeAttribute("aria-busy");
  }
}

function lyricLineHtml(line, fallback = "") {
  if (!line?.text) return escapeHtml(fallback);
  const translation = line.translation
    ? `<span class="lyric-translation">${escapeHtml(line.translation)}</span>`
    : "";
  return `${escapeHtml(line.text)}${translation}`;
}

function renderLyricList() {
  if (!els.lyricList) return;
  document.querySelector(".lyric-stage")?.classList.toggle("pure-instrumental", !lyricLines.length);
  const emptyDetailsHtml = lyricEmptyDetails.length
    ? `<span class="lyric-empty-meta">${lyricEmptyDetails.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</span>`
    : "";
  els.lyricList.innerHTML = lyricLines.length
    ? lyricLines.map((line, index) => `
      <div class="lyric-row" data-lyric-index="${index}">
        <span>${escapeHtml(line.text)}</span>
        ${line.translation ? `<em>${escapeHtml(line.translation)}</em>` : ""}
      </div>
    `).join("")
    : `<div class="lyric-row empty${lyricEmptyDetails.length ? " has-meta" : ""}"><span class="lyric-empty-title">${escapeHtml(lyricEmptyMessage || "暂无歌词")}</span>${emptyDetailsHtml}</div>`;
}

function showEmptyLyrics(message = "暂无歌词", detail = "", details = []) {
  lyricLines = [];
  activeLyricIndex = -1;
  lyricLoadState = "empty";
  lyricEmptyMessage = message || "暂无歌词";
  lyricEmptyDetails = Array.isArray(details) ? details.filter(Boolean) : [];
  if (els.currentLyric) els.currentLyric.textContent = lyricEmptyMessage;
  if (els.nextLyric) els.nextLyric.textContent = detail || "";
  renderLyricList();
}

async function loadLyrics(track, { force = false } = {}) {
  const key = track.sourceId || track.id || track.title;
  if (!force && lyricTrackKey === key && (lyricLines.length || lyricLoadState === "empty")) return;
  lyricTrackKey = key;
  lyricLines = [];
  activeLyricIndex = -1;
  lyricLoadState = "loading";
  lyricEmptyMessage = "暂无歌词";
  lyricEmptyDetails = [];
  document.querySelector(".lyric-stage")?.classList.remove("pure-instrumental");
  els.currentLyric.textContent = "正在加载歌词";
  els.nextLyric.textContent = "";
  if (els.lyricList) els.lyricList.innerHTML = `<div class="lyric-row empty">正在加载歌词</div>`;
  const songId = track.sourceId || track.id;
  if (!songId) {
    showEmptyLyrics("暂无歌词");
    paintDesktopLyrics();
    return;
  }
  try {
    const data = await api(`/api/lyric?id=${encodeURIComponent(songId)}`);
    if (lyricTrackKey !== key) return;
    lyricLines = mergeTranslatedLyrics(parseLyrics(data.lyric), parseLyrics(data.tlyric));
    const creditOnlyLyrics = isInstrumentalCreditOnly(lyricLines);
    if (!lyricLines.length || data?.nolyric || creditOnlyLyrics) {
      const instrumental = Boolean(data?.nolyric || creditOnlyLyrics);
      const creditDetails = creditOnlyLyrics
        ? lyricLines.map((line) => line.text).filter((text) => !/^纯音乐[，,]?请欣赏$/.test(String(text || "").replace(/\s+/g, "")))
        : [];
      showEmptyLyrics(instrumental ? "纯音乐" : "暂无歌词", instrumental ? "纯音乐，请欣赏" : "", creditDetails);
      paintDesktopLyrics();
      return;
    }
  } catch (error) {
    if (lyricTrackKey !== key) return;
    lyricLoadState = "error";
    showEmptyLyrics("歌词加载失败", error.message || "稍后会随播放刷新");
    lyricLoadState = "error";
    paintDesktopLyrics();
    return;
  }
  lyricLoadState = "ready";
  renderLyricList();
  syncLyricsToPlayback({ force: true, behavior: "auto" });
}

function updateLyric(seconds, { force = false, behavior = "smooth" } = {}) {
  if (!lyricLines.length) return;
  let index = lyricLines.findIndex((line, lineIndex) => seconds >= line.time && seconds < (lyricLines[lineIndex + 1]?.time ?? Infinity));
  if (index < 0) index = 0;
  els.currentLyric.innerHTML = lyricLineHtml(lyricLines[index], "纯音乐");
  els.nextLyric.innerHTML = lyricLineHtml(lyricLines[index + 1], "");
  if (index === activeLyricIndex && !force) return;
  if (!els.lyricList) return;
  activeLyricIndex = index;
  paintDesktopLyrics();
  const rows = els.lyricList.querySelectorAll(".lyric-row");
  rows.forEach((row, rowIndex) => row.classList.toggle("active", rowIndex === index));
  rows[index]?.scrollIntoView({ block: "center", behavior });
}

function syncLyricsToPlayback(options = {}) {
  if (!state?.track) return;
  const key = state.track.sourceId || state.track.id || state.track.title;
  if (lyricTrackKey !== key || (!lyricLines.length && lyricLoadState !== "empty")) {
    lyricTrackKey = "";
    loadLyrics(state.track, { force: true });
    return;
  }
  updateLyric(currentElapsed(), options);
}

function drawScope() {
  const canvas = els.scope;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const t = state?.playing ? performance.now() / 420 : 0;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = state?.track?.color || "#f4d06f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x < w; x += 4) {
    const amp = state?.playing ? 18 : 0;
    const y = h / 2 + Math.sin(x / 18 + t) * amp + Math.sin(x / 9 - t * 0.8) * amp * 0.35;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  requestAnimationFrame(drawScope);
}

async function refreshLikeState(track) {
  if (!els.like) return;
  primeLikeStateCache(track);
  if (typeof track?.liked === "boolean") {
    setLikeButtonState(track.liked);
    return;
  }
  if (isLibraryLikedTrack(track)) {
    setLikeButtonState(true);
    return;
  }
  const songId = neteaseSongId(track);
  if (!songId) {
    likeCheckKey = "";
    setLikeButtonState(false);
    return;
  }
  const cached = likeStateCache.get(String(songId));
  if (typeof cached === "boolean") {
    setLikeButtonState(cached);
    return;
  }
  const key = `${trackKey(track)}:${songId}`;
  likeCheckKey = key;
  try {
    const data = await api(`/api/netease-like-check?id=${encodeURIComponent(songId)}`);
    if (likeCheckKey !== key) return;
    likeStateCache.set(String(songId), Boolean(data.liked));
    setLikeButtonState(Boolean(data.liked));
  } catch {
    if (likeCheckKey !== key) return;
    likeStateCache.set(String(songId), false);
    setLikeButtonState(false);
  }
}

function ensureAlbumReflection() {
  if (albumReflection || !els.shell) return albumReflection;
  albumReflection = document.createElement("div");
  albumReflection.className = "album-reflection";
  albumReflection.innerHTML = `<img alt="">`;
  els.shell.appendChild(albumReflection);
  return albumReflection;
}

function updateAlbumReflection() {
  if (document.body.classList.contains("immersive-lyrics-open")) {
    if (albumReflection) albumReflection.classList.remove("visible");
    return;
  }
  if (!els.cover || !els.artist || !els.coverArt) return;
  const reflection = ensureAlbumReflection();
  const image = reflection.querySelector("img");
  const coverRect = els.cover.getBoundingClientRect();
  const targetRect = els.album && !els.album.classList.contains("hidden")
    ? els.album.getBoundingClientRect()
    : els.artist.getBoundingClientRect();
  const playerRect = els.shell.getBoundingClientRect();
  const distance = Math.max(0, targetRect.bottom - coverRect.bottom - 4);
  const height = Math.min(Math.round(distance), Math.round(coverRect.height * 0.58));
  const coverUrl = els.coverArt.currentSrc || els.coverArt.src || "";
  const visible = height > 12 && els.cover.classList.contains("has-art") && Boolean(coverUrl);
  if (image && image.src !== coverUrl) image.src = coverUrl;
  reflection.style.setProperty("--reflection-height", `${Math.max(0, height)}px`);
  reflection.style.setProperty("--reflection-source-size", `${Math.round(coverRect.height)}px`);
  reflection.style.setProperty("--reflection-width", `${Math.round(coverRect.width)}px`);
  reflection.style.left = `${Math.round(coverRect.left - playerRect.left)}px`;
  reflection.style.top = `${Math.round(coverRect.bottom - playerRect.top)}px`;
  reflection.style.width = `${Math.round(coverRect.width)}px`;
  reflection.style.height = `${Math.max(0, height)}px`;
  reflection.classList.toggle("visible", visible);
}

function scheduleAlbumReflection() {
  if (document.body.classList.contains("immersive-lyrics-open")) {
    if (albumReflection) albumReflection.classList.remove("visible");
    return;
  }
  requestAnimationFrame(() => {
    updateAlbumReflection();
    requestAnimationFrame(updateAlbumReflection);
  });
}

function ensureCoverReflectionLayer() {
  if (!els.cover) return null;
  let reflection = $("#coverReflection");
  let image = $("#coverReflectionArt");
  if (!reflection) {
    reflection = document.createElement("div");
    reflection.id = "coverReflection";
    reflection.className = "cover-reflection";
    reflection.setAttribute("aria-hidden", "true");
    els.coverArt?.insertAdjacentElement("afterend", reflection);
  }
  if (!image) {
    image = document.createElement("img");
    image.id = "coverReflectionArt";
    image.alt = "";
    reflection.appendChild(image);
  }
  els.coverReflectionArt = image;
  return image;
}

function updateCoverReflectionLayer() {
  if (!els.cover) return;
  const reflection = $("#coverReflection");
  if (!reflection) return;
  const coverRect = els.cover.getBoundingClientRect();
  const defaultHeight = Math.min(Math.round(coverRect.height * 0.34), 160);
  let height = defaultHeight;
  if (document.body.classList.contains("immersive-lyrics-open")) {
    height = Math.min(Math.round(coverRect.height * 0.46), 220);
  } else {
    const target = els.album && !els.album.classList.contains("hidden") ? els.album : els.artist;
    const targetRect = target?.getBoundingClientRect();
    if (targetRect && coverRect.height > 0) {
      height = Math.max(0, Math.round(targetRect.bottom - coverRect.bottom));
      height = Math.min(height, Math.round(coverRect.height * 0.58));
    }
  }
  const visible = height > 8 && els.cover.classList.contains("has-art");
  reflection.style.setProperty("--cover-reflection-height", `${height}px`);
  reflection.style.setProperty("--cover-reflection-source-height", `${Math.max(coverRect.height, height)}px`);
  reflection.style.top = "calc(100% + 1px)";
  reflection.style.width = `${Math.round(coverRect.width)}px`;
  reflection.classList.toggle("is-visible", visible);
}

function scheduleCoverReflectionLayer() {
  requestAnimationFrame(() => {
    updateCoverReflectionLayer();
    requestAnimationFrame(updateCoverReflectionLayer);
  });
}

function syncCoverVisual(track, { force = false } = {}) {
  if (!els.cover || !els.coverArt) return;
  const reflectionArt = ensureCoverReflectionLayer();
  const coverColor = track.color || "#8fd8ff";
  const nextBackground = `linear-gradient(135deg, ${coverColor}33, transparent 34%), linear-gradient(315deg, #f49ab133, transparent 38%), #111613`;
  const nextCoverUrl = String(track.cover || "").replace(/^http:/, "https:");
  const previousHasArt = els.cover.classList.contains("has-art");
  const nextHasArt = Boolean(nextCoverUrl);
  const previousSrc = els.coverArt.getAttribute("src") || "";

  if (force || els.cover.style.background !== nextBackground) {
    els.cover.style.setProperty("background", nextBackground);
  }
  if (force || previousHasArt !== nextHasArt) {
    els.cover.classList.toggle("has-art", nextHasArt);
  }
  if (nextCoverUrl) {
    if (force || previousSrc !== nextCoverUrl) {
      if (previousSrc && previousSrc !== nextCoverUrl) els.coverArt.removeAttribute("src");
      els.coverArt.src = nextCoverUrl;
    }
    if (reflectionArt && (force || reflectionArt.getAttribute("src") !== nextCoverUrl)) {
      if (reflectionArt.getAttribute("src") && reflectionArt.getAttribute("src") !== nextCoverUrl) reflectionArt.removeAttribute("src");
      reflectionArt.src = nextCoverUrl;
    }
    els.cover.style.setProperty("--reflection-cover", `url("${nextCoverUrl}") center bottom / cover no-repeat`);
  } else if (force || previousSrc) {
    els.coverArt.removeAttribute("src");
    reflectionArt?.removeAttribute("src");
    els.cover.style.removeProperty("--reflection-cover");
  }
  els.coverArt.alt = track.album ? `${track.album} cover` : `${track.title} cover`;

  if (force || previousHasArt !== nextHasArt || previousSrc !== nextCoverUrl) {
    scheduleAlbumReflection();
  }
  scheduleCoverReflectionLayer();
}

function paint(payload, { announce = false } = {}) {
  const previousState = state;
  const previousKey = trackKey(previousState?.track);
  const previousPlaying = Boolean(previousState?.playing);
  state = payload || previousState || {};
  const track = state.track || previousState?.track || null;
  const currentKey = trackKey(track);
  const changedTrack = previousKey !== currentKey;
  const sequenceChanged = sequenceRefreshSignature(payload?.sequenceState) !== sequenceRefreshSignature(previousState?.sequenceState);
  const desktopLyricsEnabled = Boolean(payload?.desktopLyricsEnabled);
  const localDesktopLyricsOpen = Boolean((desktopLyricsWindow && !desktopLyricsWindow.closed) || (desktopLyricsFallback && !desktopLyricsFallback.closed));
  desktopLyricsVisible = desktopLyricsEnabled || localDesktopLyricsOpen;
  els.desktopLyrics?.classList.toggle("active", desktopLyricsVisible);
  if (isDesktopShell && desktopLyricsEnabled && !desktopLyricsRestoreAttempted && !localDesktopLyricsOpen) {
    desktopLyricsRestoreAttempted = true;
    window.setTimeout(() => {
      openDesktopLyrics().catch(() => {});
    }, 120);
  }
  if (!desktopLyricsEnabled) desktopLyricsRestoreAttempted = false;
  if (Number.isFinite(Number(payload?.volume)) && Math.abs(clampVolume(payload.volume) - currentVolume) > 0.005) {
    applyVolume(Number(payload.volume), { persist: true, sync: false });
  }
  if (payload?.sequenceState?.items) {
    if (changedTrack || sequenceChanged) {
      homeSequenceViewState.offset = 0;
      document.body.classList.remove("home-queue-paged");
    }
    renderHomeQueuePreview(payload.sequenceState);
    if (sequenceChanged && (document.body.classList.contains("lyrics-queue-open") || activePanelId() === "playlist")) {
      refreshPlaybackSequenceViews({ autoScroll: false, syncHome: false }).catch(() => {});
    }
  }
  paintDesktopLyrics();
  if (!track) {
    if (els.play) {
      els.play.classList.remove("is-playing");
      els.play.setAttribute("aria-label", "继续播放");
      els.play.title = "继续播放";
    }
    if (els.duration) els.duration.textContent = format(0);
    if (els.elapsed) els.elapsed.textContent = format(0);
    if (els.seek) els.seek.value = "0";
    return;
  }
  const duration = track.duration || 150;
  els.mood.innerHTML = (track.albumId || neteaseSongId(track))
    ? albumLinkHtml(track.album || payload.library?.playlistName || "Local Radio", track.albumId, "album-link mood-album", neteaseSongId(track))
    : escapeHtml(track.album || payload.library?.playlistName || "Local Radio");
  els.title.textContent = track.title;
  els.title.title = track.title;
  els.title.classList.toggle("long-title", track.title.length > 42);
  els.title.classList.toggle("very-long-title", track.title.length > 72);
  els.artist.innerHTML = artistLinksHtml(track.artist, "artist-link", track.artistIds || []);
  els.artist.title = track.artist ? `打开 ${track.artist}` : "";
  els.artist.dataset.artist = track.artist || "";
  els.artist.dataset.artistId = track.artistId || track.artistIds?.[0] || "";
  if (els.album) {
    const albumTitle = track.album || "";
    els.album.innerHTML = albumTitle
      ? albumLinkHtml(albumTitle, track.albumId, "album-link track-album-link", neteaseSongId(track))
      : "";
    els.album.classList.toggle("hidden", !albumTitle);
    els.album.title = albumTitle ? `打开专辑 ${albumTitle}` : "";
  }
  els.libraryCount.textContent = "";
  // AI DJ disabled for now. Restore these lines if the host copy is needed again:
  // els.hostLine.textContent = payload.lastHostLine;
  // if (!payload.lastHostLine) els.hostLine.textContent = " ";
  els.hostLine.textContent = "";
  els.duration.textContent = format(duration);
  updateWeatherLabel(payload.weather);
  syncCoverVisual(track, { force: changedTrack });
  if (changedTrack || !audioUrlCache.has(audioUrlCacheKey(track))) prefetchAudioUrl(track);
  const effectivePlaying = isEffectivelyPlaying(payload);
  els.play.textContent = "";
  els.play.classList.toggle("is-playing", effectivePlaying);
  els.play.setAttribute("aria-label", effectivePlaying ? "暂停播放" : "继续播放");
  els.play.title = effectivePlaying ? "暂停播放" : "继续播放";
  if (els.like) {
    const canLike = Boolean(neteaseSongId(track));
    els.like.disabled = !canLike;
    els.like.title = canLike ? `红心 ${track.title}` : "当前歌曲没有网易云 songId";
    if (!canLike) {
      setLikeButtonState(false);
    } else {
      primeLikeStateCache(track);
      const knownLikeState = cachedLikeState(track);
      if (typeof knownLikeState === "boolean") {
        setLikeButtonState(knownLikeState);
      } else if (changedTrack) {
        setLikeButtonState(false);
      }
      if (changedTrack || typeof knownLikeState !== "boolean") refreshLikeState(track);
    }
  }
  if (els.favoritePlaylist) {
    const canFavorite = Boolean(neteaseSongId(track));
    els.favoritePlaylist.disabled = !canFavorite;
    els.favoritePlaylist.title = canFavorite ? `添加 ${track.title} 到自定义歌单` : "当前歌曲没有网易云 songId";
    if (!canFavorite) toggleFavoritePlaylistMenu(false);
  }
  {
    const ui = ensureMemoryCoordinateUi();
    const canShowMemory = Boolean(neteaseSongId(track));
    if (ui.button) {
      ui.button.disabled = !canShowMemory;
      ui.button.title = canShowMemory ? `查看 ${track.title} 的回忆坐标` : "当前歌曲没有网易云 songId";
    }
    const memoryCover = String(track.cover || "").replace(/^http:/, "https:");
    if (ui.bg) ui.bg.style.backgroundImage = memoryCover ? `url("${memoryCover}")` : "";
  }
  if (els.mode) {
    const labels = { sequence: "顺序播放", "repeat-one": "单曲循环", shuffle: "随机播放" };
    const icons = { sequence: "→", "repeat-one": "①", shuffle: "⤨" };
    els.mode.textContent = icons[payload.playbackMode] || "⇥";
    els.mode.title = `播放方式：${labels[payload.playbackMode] || "顺序播放"}`;
  }
  if (els.sequence) {
    els.sequence.textContent = "☰";
    els.sequence.title = document.body.classList.contains("immersive-lyrics-open") ? "打开播放列表" : "播放列表";
    els.sequence.setAttribute("aria-label", els.sequence.title);
  }
  els.shell.classList.toggle("playing", payload.playing);
  if (els.signal && (!els.signal.textContent || els.signal.textContent === "NCM LINK LIVE")) els.signal.textContent = payload.playing ? "ON AIR" : "READY";
  renderHistory(payload.history || []);
  if (changedTrack || sequenceChanged) {
    schedulePlaylistPanelRefresh({ autoScroll: changedTrack });
  }

  if (changedTrack) {
    const restoredPosition = savedPositionForPayload(payload);
    elapsedBeforePause = restoredPosition;
    pendingRestoreSeek = restoredPosition;
    startedAt = Date.now();
    loadLyrics(track);
  } else if (!audio) {
    const restoredPosition = savedPositionForPayload(payload);
    if (restoredPosition > 0) {
      elapsedBeforePause = restoredPosition;
      pendingRestoreSeek = restoredPosition;
    }
  }
  if (payload.playing) {
    if (!startedAt) startedAt = Date.now();
    const currentAudioKey = audioKey(track);
    const soundIsCurrent = hasAudibleCurrentAudio(currentAudioKey) || pendingAudioKey === currentAudioKey;
    if (changedTrack || !previousPlaying || !soundIsCurrent) {
      if (track.sourceId || track.id || track.url) startAudio(track);
      else startTone(track);
    } else if (!audio && (track.sourceId || track.id || track.url)) {
      markAudioUnlockPending();
    }
  } else if (previousPlaying) {
    pauseSound();
  }
  // AI DJ disabled for now. Restore this if host narration should be spoken again:
  // if (announce) speak(payload.lastHostLine);
}

function renderHistory(history) {
  els.history.innerHTML = history.length
    ? history.map((item, index) => `
      <article>
        <button class="delete-history" data-id="${escapeHtml(item.id || `index-${index}`)}" title="Delete" aria-label="Delete ${escapeHtml(item.track.title)}">×</button>
        <strong>${escapeHtml(item.track.title)}</strong>
        <em>${escapeHtml(item.track.artist || "")}</em>
        <small>${escapeHtml(item.line)}</small>
      </article>
    `).join("")
    : `<article><strong>等待第一段串场</strong><small>点下一首，会生成一次上下文口播。</small></article>`;
}

async function loadTaste() {
  const data = await api("/api/profile");
  const profile = data.profile || { styles: [], topArtists: [], summary: "" };
  const chips = [
    ...(profile.styles || []).map((item) => item.name),
    ...(profile.topArtists || []).slice(0, 4).map((item) => item.name)
  ].slice(0, 12);
  if (els.tasteList) els.tasteList.innerHTML = chips.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  if (els.profileSummary) els.profileSummary.textContent = profile.summary || "";
  updateChatMemory(data.memory);
}

function updateChatMemory(memory) {
  if (!memory) return;
  const cleanMemoryText = (value) => String(value || "")
    .replace(/[?？]{2,}/g, "")
    .replace(/\uFFFD/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const prefsList = (memory.preferences || []).map(cleanMemoryText).filter(Boolean);
  const recentList = (memory.recentAsks || []).map(cleanMemoryText).filter(Boolean);
  const prefs = prefsList.length ? prefsList.join(" / ") : "还在学习你的口味";
  const recent = recentList.length ? `最近：${recentList.slice(0, 2).join(" / ")}` : "";
  const text = [`Memory on · ${prefs}`, recent].filter(Boolean).join(" · ");
  if (els.chatMemory) els.chatMemory.textContent = text;
  if (els.homeChatMemory) els.homeChatMemory.textContent = text;
}

function sequenceRefreshSignature(sequenceState) {
  const items = Array.isArray(sequenceState?.items) ? sequenceState.items : [];
  const sample = items.slice(0, 24).map((item, index) => [
    item?.sourceId || item?.id || "",
    item?.source === "current" ? "1" : "0",
    Number(item?.sequenceNumber ?? index + 1)
  ].join(":")).join("|");
  return [
    Number(sequenceState?.totalCount || items.length || 0),
    Number(sequenceState?.offset || 0),
    Number(sequenceState?.returned || items.length || 0),
    sample
  ].join("~");
}

function renderPlaylist(data, { autoScroll = true } = {}) {
  if (!els.playlistList) return;
  if (els.playlistUndo) els.playlistUndo.disabled = !data.canUndoPlaylist;
  if (els.playlistRedo) els.playlistRedo.disabled = !data.canRedoPlaylist;
  if (data.sequence) {
    sequenceItems = data.items || [];
    const playlistTitle = document.querySelector("#playlist .panel-head h3");
    if (playlistTitle) playlistTitle.textContent = "播放列表";
    const sequenceCount = data.totalCount || sequenceItems.length || 0;
    sequenceViewState.total = sequenceCount;
    sequenceViewState.offset = Number(data.offset || 0);
    sequenceViewState.returned = Number(data.returned || sequenceItems.length || 0);
    const page = Math.floor(sequenceViewState.offset / sequencePageSize) + 1;
    const pages = Math.max(1, Math.ceil(sequenceCount / sequencePageSize));
    els.playlistMeta.textContent = `共 ${sequenceCount} 首`;
    els.playlistPage.textContent = `${page} / ${pages}`;
    els.playlistPrev.disabled = sequenceViewState.offset <= 0;
    els.playlistNext.disabled = sequenceViewState.offset + sequenceViewState.returned >= sequenceViewState.total;
    if (els.playlistClear) els.playlistClear.disabled = sequenceCount <= 1;
    els.playlistList.innerHTML = sequenceItems.length
      ? sequenceItems.map((track, order) => {
        const displayIndex = Number(track?.sequenceNumber ?? (sequenceViewState.offset + order + 1));
        const absoluteOrder = sequenceViewState.offset + order;
        return `
        <button type="button" class="playlist-row sequence-row ${track.source === "current" ? "active-sequence" : ""}"
          data-sequence="${absoluteOrder}"
          data-sequence-local-index="${order}"
          data-sequence-number="${escapeHtml(String(displayIndex))}"
          data-source-id="${escapeHtml(track.sourceId || "")}"
          data-title="${escapeHtml(track.title || "")}"
          data-artist="${escapeHtml(track.artist || "")}"
          data-album="${escapeHtml(track.album || "")}"
          data-cover="${escapeHtml(track.cover || "")}"
          data-duration="${escapeHtml(track.duration || "")}"
          title="播放 ${escapeHtml(track.title)}">
          <span class="row-left">
            <span class="row-index">${displayIndex}</span>
            ${track.cover ? `<img class="row-cover" src="${escapeHtml(normalizeCoverUrl(track.cover))}" alt="" loading="eager" data-cover-key="${escapeHtml(trackKey(track))}">` : `<span class="row-cover row-cover-fallback"></span>`}
            <span class="row-main">
              <strong>${escapeHtml(track.title)}</strong>
              <small>${escapeHtml(track.artist)}${track.album ? ` · ${escapeHtml(track.album)}` : ""}${track.label ? ` · ${escapeHtml(track.label)}` : ""}</small>
            </span>
          </span>
          <span class="row-side">
            <span class="row-duration">${format(track.duration || 0)}</span>
            ${track.source !== "current" ? `<span class="sequence-delete-button" data-delete-sequence="${order}" aria-hidden="true" title="移除">×</span>` : ""}
          </span>
        </button>
      `;
      }).join("")
      : `<article class="empty-list">暂无播放序列。</article>`;
    if (autoScroll) {
      els.playlistList.querySelector(".active-sequence")?.scrollIntoView({ block: "start", behavior: "auto" });
    }
    return;
  }
  sequenceItems = [];
  playlistState.total = data.filteredCount ?? data.trackCount ?? 0;
  playlistState.offset = data.offset || 0;
  playlistState.returned = data.returned || 0;
  const page = Math.floor(playlistState.offset / playlistPageSize) + 1;
  const pages = Math.max(1, Math.ceil(playlistState.total / playlistPageSize));
  els.playlistMeta.textContent = playlistState.query
    ? `${playlistState.total} matches`
    : `${data.trackCount || 0} tracks`;
  els.playlistPage.textContent = `${page} / ${pages}`;
  els.playlistPrev.disabled = playlistState.offset <= 0;
  els.playlistNext.disabled = playlistState.offset + playlistState.returned >= playlistState.total;
  const tracks = data.tracks || [];
  els.playlistList.innerHTML = tracks.length
    ? tracks.map((track) => `
      <button class="playlist-row"
        data-index="${track.index}"
        data-source-id="${escapeHtml(track.sourceId || "")}"
        data-title="${escapeHtml(track.title || "")}"
        data-artist="${escapeHtml(track.artist || "")}"
        data-album="${escapeHtml(track.album || "")}"
        data-cover="${escapeHtml(track.cover || "")}"
        data-duration="${escapeHtml(track.duration || "")}"
        title="播放 ${escapeHtml(track.title)}">
        <span class="row-left">
          <span class="row-index">${track.index + 1}</span>
          <span class="row-main">
            <strong>${escapeHtml(track.title)}</strong>
            <small>${escapeHtml(track.artist)}${track.album ? ` · ${escapeHtml(track.album)}` : ""}</small>
          </span>
        </span>
        <span class="row-duration">${format(track.duration || 0)}</span>
      </button>
    `).join("")
    : `<article class="empty-list">没有找到匹配的歌曲。</article>`;
}

async function loadPlaylist(query = playlistState.query, offset = playlistState.offset) {
  playlistState.query = query;
  playlistState.offset = Math.max(0, offset);
  const params = new URLSearchParams({
    limit: String(playlistPageSize),
    offset: String(playlistState.offset)
  });
  if (playlistState.query) params.set("q", playlistState.query);
  renderPlaylist(await api(`/api/library?${params}`));
}

async function loadSequence() {
  try {
    await refreshPlaybackSequenceViews({ open: true, loading: true });
  } catch (error) {
    if (els.playlistList) {
      els.playlistList.innerHTML = `<article class="empty-list">播放列表读取失败：${escapeHtml(error.message || "请稍后重试")}</article>`;
    }
    showTransientStatus("播放列表读取失败");
  }
}

async function loadSequencePanelOnly() {
  try {
    await refreshPlaybackSequenceViews({ loading: true });
  } catch (error) {
    if (els.playlistList) {
      els.playlistList.innerHTML = `<article class="empty-list">播放列表读取失败：${escapeHtml(error.message || "请稍后重试")}</article>`;
    }
    showTransientStatus("播放列表读取失败");
  }
}

async function refreshHomeQueuePreview() {
  try {
    if (!document.body.classList.contains("home-queue-paged")) {
      homeSequenceViewState.offset = 0;
    }
    const params = new URLSearchParams({
      limit: String(sequencePageSize),
      offset: String(Math.max(0, Number(homeSequenceViewState.offset || 0)))
    });
    const data = { ...(await api(`/api/sequence?${params}`)), sequence: true };
    renderHomeQueuePreview(data);
    return data;
  } catch {
    renderHomeQueuePreview({ items: [] });
    return { items: [] };
  }
}

async function refreshPlaybackSequenceViews({ open = false, loading = false, offset = sequenceViewState.offset, autoScroll = true, syncHome = true } = {}) {
  const token = ++sequenceRefreshToken;
  if (open) openPanel("playlist");
  if (loading && els.playlistList && !els.playlistList.querySelector(".playlist-row")) {
    els.playlistList.innerHTML = `<article class="empty-list">正在读取播放序列...</article>`;
  }
  const params = new URLSearchParams({
    limit: String(sequencePageSize),
    offset: String(Math.max(0, Number(offset || 0)))
  });
  const data = { ...(await api(`/api/sequence?${params}`)), sequence: true };
  if (token !== sequenceRefreshToken) return data;
  renderPlaylist(data, { autoScroll });
  if (syncHome) await refreshHomeQueuePreview();
  return data;
}

async function playSequenceItem(item, element) {
  if (!item || item.source === "current") return;
  debugClient("play-sequence-item:start", {
    title: item.title || "",
    sourceId: item.sourceId || "",
    sequenceOrder: Number(element?.dataset?.sequence ?? -1),
    sequenceNumber: Number(element?.dataset?.sequenceNumber ?? item.sequenceNumber ?? 1)
  });
  startOptimisticPlayback(trackFromDataset(element) || item, element);
  try {
    const body = {
      fromSequence: true,
      source: item.source || "",
      sourceId: item.sourceId || "",
      track: trackFromDataset(element) || item,
      sequenceOrder: Number(element?.dataset?.sequence ?? -1),
      sequenceNumber: Number(element?.dataset?.sequenceNumber ?? item.sequenceNumber ?? 1)
    };
    const payload = await api("/api/play", {
      method: "POST",
      body: JSON.stringify(body)
    });
    debugClient("play-sequence-item:success", {
      title: payload?.track?.title || "",
      sourceId: payload?.track?.sourceId || ""
    });
    paint(payload, { announce: true });
    await refreshPlaybackSequenceViews();
  } catch (error) {
    debugClient("play-sequence-item:error", {
      message: error?.message || "unknown error",
      title: item.title || "",
      sourceId: item.sourceId || ""
    });
    throw error;
  } finally {
    finishOptimisticPlayback(element);
  }
}

async function deleteSequenceItem(item) {
  if (!item || item.source === "current") return;
  const payload = await api("/api/sequence", {
    method: "DELETE",
    body: JSON.stringify({
      source: item.source || "",
      index: Number.isInteger(Number(item.index)) ? Number(item.index) : -1,
      sourceId: item.sourceId || "",
      title: item.title || ""
    })
  });
  paint(payload, { announce: false });
  await refreshPlaybackSequenceViews();
  showTransientStatus("已从播放序列移除");
}

async function clearSequence() {
  const payload = await api("/api/sequence", {
    method: "DELETE",
    body: JSON.stringify({ clearAll: true })
  });
  sequenceViewState.offset = 0;
  paint(payload, { announce: false });
  await refreshPlaybackSequenceViews({ offset: 0 });
  showTransientStatus("已清空播放列表");
}

async function setPlaying(playing) {
  debugClient("set-playing:start", {
    playing,
    currentTitle: state?.track?.title || "",
    currentSourceId: state?.track?.sourceId || state?.track?.id || "",
    statePlaying: Boolean(state?.playing)
  });
  if (playing && state?.playing && audioUnlockPending) {
    await resumeAudioAfterGesture();
    return;
  }
  const positionSeconds = currentElapsed();
  const currentTrack = state?.track;
  if (playing && !currentTrack) {
    debugClient("set-playing:no-track", { statePlaying: Boolean(state?.playing) });
    showTransientStatus("先选择一首歌");
    return;
  }
  const currentTrackKey = currentTrack ? playbackPositionKey(currentTrack) : "";
  const previousPlaying = Boolean(state?.playing);
  let audioStarted = true;
  if (playing) {
    startedAt = Date.now();
    if (currentTrack) {
      const currentAudioKey = audioKey(currentTrack);
      const isCurrentAudioSource = Boolean(
        audio &&
        (audio.currentSrc || audio.src) &&
        activeSoundKey === currentAudioKey
      );
      const canResumeCurrentAudio = Boolean(
        isCurrentAudioSource &&
        audio.paused
      );
      const alreadyPlayingCurrentAudio = Boolean(
        isCurrentAudioSource &&
        !audio.paused &&
        !audio.ended
      );
      if (alreadyPlayingCurrentAudio) {
        audioUnlockPending = false;
        audioStarted = true;
      } else if (canResumeCurrentAudio) {
        try {
          await audio.play();
          audioUnlockPending = false;
          audioStarted = true;
        } catch (error) {
          if (isAutoplayBlocked(error)) markAudioUnlockPending();
          audioStarted = false;
        }
      } else if (currentTrack.sourceId || currentTrack.id || currentTrack.url) {
        audioStarted = await startAudio(currentTrack);
      } else {
        startTone(currentTrack);
        audioStarted = true;
      }
    }
    if (!audioStarted) {
      debugClient("set-playing:audio-not-started", {
        currentTitle: currentTrack?.title || "",
        currentSourceId: currentTrack?.sourceId || currentTrack?.id || "",
        pendingAudioKey,
        activeSoundKey
      });
      paint({ ...(state || {}), playing: false });
      return;
    }
    audioContext ||= new AudioContext();
    audioContext?.resume?.().catch(() => {});
  } else {
    elapsedBeforePause = positionSeconds;
    if (audio) audio.pause();
  }
  state = {
    ...state,
    playing
  };
  paint(state);
  try {
    const payload = await api("/api/state", {
      method: "POST",
      body: JSON.stringify({
        playing,
        positionSeconds,
        positionTrackKey: currentTrackKey
      })
    });
    debugClient("set-playing:success", {
      playing: Boolean(payload?.playing),
      currentTitle: payload?.track?.title || "",
      currentSourceId: payload?.track?.sourceId || payload?.track?.id || ""
    });
    paint(payload);
  } catch (error) {
    debugClient("set-playing:error", {
      playing,
      message: error?.message || "unknown error",
      currentTitle: currentTrack?.title || "",
      currentSourceId: currentTrack?.sourceId || currentTrack?.id || ""
    });
    state = {
      ...state,
      playing: previousPlaying
    };
    paint(state);
    if (playing && currentTrack && previousPlaying) {
      if (audio) audio.pause();
    } else if (playing && !previousPlaying) {
      stopSound();
    } else if (!playing && currentTrack && previousPlaying) {
      startAudio(currentTrack);
    }
    showTransientStatus(playing ? "播放失败" : "暂停失败");
    throw error;
  }
}

async function handlePlayButtonClick(event) {
  event?.preventDefault?.();
  debugClient("play-button:click", {
    currentTitle: state?.track?.title || "",
    currentSourceId: state?.track?.sourceId || state?.track?.id || "",
    playing: Boolean(state?.playing)
  });
  let currentTrack = state?.track;
  if (!currentTrack) {
    try {
      const payload = await api("/api/now");
      paint(payload, { announce: false });
      currentTrack = payload?.track || null;
    } catch (error) {
      debugClient("play-button:no-track", { message: error?.message || "unknown error" });
      showTransientStatus("播放状态加载失败");
      return;
    }
  }
  if (!currentTrack) {
    debugClient("play-button:no-track", { message: "empty current track" });
    showTransientStatus("先选择一首歌");
    return;
  }
  if (currentTrack) {
    const currentAudioKey = audioKey(currentTrack);
    const hasLiveAudio = hasAudibleCurrentAudio(currentAudioKey);
    const isCurrentPending = pendingAudioKey === currentAudioKey;
    const hasCurrentSource = Boolean(
      audio &&
      (audio.currentSrc || audio.src) &&
      activeSoundKey === currentAudioKey
    );
    const isActuallyPlaying = Boolean(
      audio &&
      hasCurrentSource &&
      !audio.paused &&
      !audio.ended
    );
    const isActuallyPaused = Boolean(
      audio &&
      hasCurrentSource &&
      audio.paused
    );
    if (isActuallyPlaying) {
      await setPlaying(false);
      return;
    }
    if (state?.playing && currentTrack) {
      if (isCurrentPending) pendingAudioKey = "";
      await setPlaying(true);
      return;
    }
    if (!hasCurrentSource) {
      await setPlaying(true);
      return;
    }
    if (audioUnlockPending || isCurrentPending || (!hasLiveAudio && !isActuallyPaused)) {
      pendingAudioKey = "";
      await setPlaying(true);
      return;
    }
    if (isActuallyPaused) {
      await setPlaying(true);
      return;
    }
  }
  await setPlaying(true);
}

let playPointerHandled = false;

async function handlePlayPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault?.();
  playPointerHandled = true;
  try {
    await handlePlayButtonClick(event);
  } finally {
    window.setTimeout(() => {
      playPointerHandled = false;
    }, 500);
  }
}

async function handlePlayClick(event) {
  if (playPointerHandled) {
    event?.preventDefault?.();
    return;
  }
  await handlePlayButtonClick(event);
}

document.addEventListener("pointerdown", (event) => {
  if (!audioUnlockPending) return;
  if (event.target?.closest?.("#playBtn")) return;
}, { capture: true });

document.addEventListener("keydown", () => {
  if (audioUnlockPending) resumeAudioAfterGesture();
}, { capture: true });

function restartCurrentTrack(track) {
  elapsedBeforePause = 0;
  startedAt = Date.now();
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(() => startAudio(track));
  } else if (track?.sourceId || track?.id || track?.url) {
    startAudio(track);
  } else if (track) {
    startTone(track);
  }
}

async function nextTrack(reason = "manual") {
  if (nextInFlight) return;
  nextInFlight = true;
  debugClient("next-track:start", {
    reason,
    currentTitle: state?.track?.title || "",
    currentSourceId: state?.track?.sourceId || state?.track?.id || ""
  });
  const previousKey = trackKey(state?.track);
  const fallbackTrack = state?.track ? { ...state.track } : null;
  const fallbackWasPlaying = Boolean(state?.playing);
  if (reason === "manual") {
    await primeAudioPlayback().catch(() => {});
    stopSound();
  }
  try {
    const payload = await api("/api/next");
    payload.playing = true;
    debugClient("next-track:success", {
      reason,
      nextTitle: payload?.track?.title || "",
      nextSourceId: payload?.track?.sourceId || payload?.track?.id || ""
    });
    paint(payload, { announce: true });
    refreshPlaybackSequenceViews().catch(() => {});
    if (payload.playbackMode === "repeat-one" && previousKey && previousKey === trackKey(payload.track)) {
      restartCurrentTrack(payload.track);
    }
  } catch (error) {
    debugClient("next-track:error", {
      reason,
      message: error?.message || "unknown error",
      currentTitle: fallbackTrack?.title || "",
      currentSourceId: fallbackTrack?.sourceId || fallbackTrack?.id || ""
    });
    if (fallbackTrack && fallbackWasPlaying) {
      state = { ...state, track: fallbackTrack, playing: true };
      startAudio(fallbackTrack);
    }
    showTransientStatus(error.message || "切换下一首失败");
  } finally {
    window.setTimeout(() => {
      nextInFlight = false;
    }, 180);
  }
}

async function previousTrack() {
  if (nextInFlight) return;
  nextInFlight = true;
  debugClient("previous-track:start", {
    currentTitle: state?.track?.title || "",
    currentSourceId: state?.track?.sourceId || state?.track?.id || ""
  });
  const previousKey = trackKey(state?.track);
  const fallbackTrack = state?.track ? { ...state.track } : null;
  const fallbackWasPlaying = Boolean(state?.playing);
  await primeAudioPlayback().catch(() => {});
  stopSound();
  try {
    const payload = await api("/api/previous");
    payload.playing = true;
    debugClient("previous-track:success", {
      previousTitle: payload?.track?.title || "",
      previousSourceId: payload?.track?.sourceId || payload?.track?.id || ""
    });
    paint(payload, { announce: true });
    refreshPlaybackSequenceViews().catch(() => {});
    if (payload.playbackMode === "repeat-one" && previousKey && previousKey === trackKey(payload.track)) {
      restartCurrentTrack(payload.track);
    }
  } catch (error) {
    debugClient("previous-track:error", {
      message: error?.message || "unknown error",
      currentTitle: fallbackTrack?.title || "",
      currentSourceId: fallbackTrack?.sourceId || fallbackTrack?.id || ""
    });
    if (fallbackTrack && fallbackWasPlaying) {
      state = { ...state, track: fallbackTrack, playing: true };
      startAudio(fallbackTrack);
    }
    showTransientStatus(error.message || "切换上一首失败");
  } finally {
    window.setTimeout(() => {
      nextInFlight = false;
    }, 180);
  }
}

async function cyclePlaybackMode() {
  const modes = ["sequence", "repeat-one", "shuffle"];
  const current = state?.playbackMode || "sequence";
  const nextMode = modes[(modes.indexOf(current) + 1) % modes.length];
  debugClient("cycle-playback-mode:start", { current, nextMode });
  const payload = await api("/api/state", {
    method: "POST",
    body: JSON.stringify({ playbackMode: nextMode })
  });
  debugClient("cycle-playback-mode:success", { current: payload?.playbackMode || nextMode });
  paint(payload);
}

function tick() {
  if (state?.track) {
    const duration = state.track.duration || 150;
    const elapsed = currentElapsed();
    els.elapsed.textContent = format(elapsed);
    els.seek.value = Math.min(1000, Math.round((elapsed / duration) * 1000));
    updateLyric(elapsed);
    if (state.playing) reportPlaybackPosition();
    if (state.playing && !audio && !silentFallbackTimer && !pendingAudioKey && elapsed >= duration) nextTrack("timer");
  }
}

setInterval(tick, 500);

function seekToSliderValue() {
  if (!state?.track || !els.seek) return;
  const duration = state.track.duration || 150;
  const seconds = Math.max(0, Math.min(duration, (Number(els.seek.value) / 1000) * duration));
  elapsedBeforePause = seconds;
  startedAt = Date.now();
  els.elapsed.textContent = format(seconds);
  els.seek.value = Math.min(1000, Math.round((seconds / duration) * 1000));
  updateLyric(seconds);
  if (audio) {
    try {
      audio.currentTime = seconds;
    } catch {
      audio.addEventListener("loadedmetadata", () => {
        try {
          audio.currentTime = seconds;
        } catch {}
      }, { once: true });
    }
  }
  reportPlaybackPosition({ force: true });
}

function addChat(role, text) {
  const p = document.createElement("p");
  p.className = role === "me" ? "me" : "";
  p.innerHTML = `<small>${role === "me" ? "You" : "Station"}</small><br>${escapeHtml(text)}`;
  els.chatLog.appendChild(p);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  return p;
}

function stationMessageHtml(text, recommendations = []) {
  const batchTracks = escapeHtml(encodeURIComponent(JSON.stringify(recommendations.map((item) => ({
    sourceId: item.sourceId || "",
    title: item.title || "",
    artist: item.artist || "",
    artistIds: item.artistIds || [],
    artistId: item.artistId || item.artistIds?.[0] || "",
    album: item.album || "",
    albumId: item.albumId || "",
    cover: item.cover || "",
    duration: Number(item.duration || 0)
  })))));
  const cards = recommendations.length
    ? `<div class="recommendations"><div class="recommendation-actions"><button class="chat-append-all" type="button" data-chat-batch="${batchTracks}" title="追加全部到当前队列">追加全部</button></div>${recommendations.map((item) => `
      <button class="song-card" type="button"
        data-index="${item.index}"
        data-external="${item.external ? "1" : ""}"
        data-source-id="${escapeHtml(item.sourceId || "")}"
        data-title="${escapeHtml(item.title || "")}"
        data-artist="${escapeHtml(item.artist || "")}"
        data-artist-ids="${escapeHtml(JSON.stringify(item.artistIds || []))}"
        data-album="${escapeHtml(item.album || "")}"
        data-album-id="${escapeHtml(item.albumId || "")}"
        data-cover="${escapeHtml(item.cover || "")}"
        data-duration="${escapeHtml(item.duration || "")}"
        title="加入当前队列 ${escapeHtml(item.title)}">
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml([item.external ? "网易云" : "", item.artist || "", item.album || ""].filter(Boolean).join(" · "))}</small>
        </span>
        <span class="play-chip" aria-hidden="true"></span>
      </button>
    `).join("")}</div>`
    : "";
  return `<small>Station</small><br>${escapeHtml(text)}${cards}`;
}

function recommendationCards(recommendations = []) {
  return recommendations.length
    ? recommendations.map((item) => `
      <button class="song-card" type="button"
        data-index="${item.index}"
        data-external="${item.external ? "1" : ""}"
        data-source-id="${escapeHtml(item.sourceId || "")}"
        data-title="${escapeHtml(item.title || "")}"
        data-artist="${escapeHtml(item.artist || "")}"
        data-artist-ids="${escapeHtml(JSON.stringify(item.artistIds || []))}"
        data-album="${escapeHtml(item.album || "")}"
        data-album-id="${escapeHtml(item.albumId || "")}"
        data-cover="${escapeHtml(item.cover || "")}"
        data-duration="${escapeHtml(item.duration || "")}"
        title="播放 ${escapeHtml(item.title)}">
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml([item.external ? "网易云" : "", item.artist || "", item.album || ""].filter(Boolean).join(" · "))}</small>
        </span>
        <span class="play-chip" aria-hidden="true"></span>
      </button>
    `).join("")
    : `<article class="empty-list">没有结果</article>`;
}

function songTags(tags = []) {
  return Array.isArray(tags) && tags.length
    ? `<span class="song-tags">${tags.slice(0, 3).map((tag) => `<b class="${songTagClass(tag)}">${escapeHtml(tag)}</b>`).join("")}</span>`
    : "";
}

function songTagClass(tag) {
  const text = String(tag || "");
  if (/vip|付费|试听|版权/i.test(text)) return "tag-red";
  if (/超清|母带|无损|hi-?res|sq|hr/i.test(text)) return "tag-gold";
  if (/红心|喜欢|收藏/.test(text)) return "tag-heart";
  if (/播放|听你爱的|推荐|昨日|关注/.test(text)) return "tag-red";
  return "tag-green";
}

function songidIntroTexts(name = "NetEase Queue", source = {}) {
  const custom = String(customSongidIntro(name, source) || "").trim();
  const summary = String(source.summary || "").trim();
  const fullText = String(source.description || summary || "").trim();
  return {
    collapsed: custom || summary || fullText,
    expanded: custom || fullText || summary
  };
}

function songidDetailMetaHtml(items = [], name = "NetEase Queue", source = {}) {
  const count = items.filter((item) => item.sourceId).length;
  const cover = normalizeCoverUrl(source.cover || items.find((item) => item.cover)?.cover || "");
  const { collapsed, expanded } = songidIntroTexts(name, source);
  const hideEmptyIntro = !collapsed && !expanded;
  return `
    <span class="songid-detail-meta">
      ${cover ? `<img src="${escapeHtml(cover)}" alt="">` : `<span class="songid-detail-cover-fallback"></span>`}
      <span class="songid-detail-copy">
        <strong>${escapeHtml(name)}</strong>
        <small>${count ? `${count} 首歌曲` : "没有可播放结果"}</small>
        <div class="songid-intro-line${hideEmptyIntro ? " hidden" : ""}" data-summary="${escapeHtml(collapsed)}" data-full="${escapeHtml(expanded)}">
          <p>${escapeHtml(collapsed)}</p>
          <button type="button" class="songid-intro-toggle" aria-label="展开简介" aria-expanded="false">▾</button>
        </div>
      </span>
    </span>
  `;
}

function setSongidBatch(items = [], name = "NetEase Queue", source = {}) {
  currentSongidBatch = items.filter((item) => item.sourceId);
  currentSongidBatchName = name;
  currentSongidSource = source || {};
  setSongidView("results");
  document.body.classList.add("songid-detail-open");
  els.songidStage?.classList.remove("hidden");
  els.songidResults?.classList.remove("hidden");
  if (els.songidPlayAll) els.songidPlayAll.disabled = currentSongidBatch.length === 0;
  if (els.songidAppendAll) els.songidAppendAll.disabled = currentSongidBatch.length === 0;
  if (els.songidEditIntro) {
    const editable = canEditSongidIntro(currentSongidSource);
    els.songidEditIntro.disabled = !editable;
    els.songidEditIntro.classList.toggle("hidden", !editable);
  }
  if (els.songidActionMenuBtn) els.songidActionMenuBtn.disabled = currentSongidBatch.length === 0;
  if (els.songidMeta) {
    els.songidMeta.innerHTML = songidDetailMetaHtml(currentSongidBatch, name, source);
  }
  document.querySelector("#songid")?.classList.remove("songid-intro-expanded");
  if (els.songidResults) els.songidResults.innerHTML = songidCards(currentSongidBatch);
}

function decorateBatchTracks(items = [], playlistName = "NetEase Queue", playlistId = "") {
  const safeName = String(playlistName || "NetEase Queue").trim() || "NetEase Queue";
  const safeId = String(playlistId || safeName || "batch").trim().slice(0, 120) || "batch";
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.sourceId)
    .map((item) => {
      const playlists = Array.isArray(item.playlists) ? item.playlists.filter((entry) => entry?.name) : [];
      const hasPlaylist = playlists.some((entry) => String(entry.name || "").trim() === safeName);
      return {
        ...item,
        playlists: hasPlaylist ? playlists : [{ id: safeId, name: safeName }, ...playlists].slice(0, 6)
      };
    });
}

function setSongidView(mode = "home") {
  const panel = document.querySelector("#songid");
  if (!panel) return;
  panel.dataset.mode = mode;
  panel.classList.toggle("songid-home", mode === "home");
  panel.classList.toggle("songid-results-mode", mode !== "home");
  document.body.classList.toggle("songid-detail-open", mode !== "home");
  if (mode === "home") {
    els.songidStage?.classList.add("hidden");
    els.songidResults?.classList.add("hidden");
    if (els.songidInput) els.songidInput.value = "";
    setSongidSource("");
  }
}

function setSongidSource(source) {
  document.querySelectorAll(".source-card").forEach((button) => {
    button.classList.toggle("active", button.dataset.source === source);
  });
}

function sourceCardById(source) {
  return [...document.querySelectorAll(".source-card")].find((card) => card.dataset.source === source) || null;
}

function homePlaylistCardById(source) {
  return [...document.querySelectorAll(".home-playlist-card")].find((card) => card.dataset.source === source) || null;
}

function normalizeCoverUrl(url) {
  return String(url || "").replace(/^http:/, "https:");
}

function updateSourceCardCaption(source, payload = {}) {
  const card = sourceCardById(source);
  const homeCard = homePlaylistCardById(source);
  const cover = payload?.cover || payload?.source?.cover || payload?.recommendations?.find?.((item) => item.cover)?.cover || "";
  const name = payload?.name || payload?.source?.name || "";
  if (card && name) {
    const title = card.querySelector("strong");
    if (title) title.textContent = name;
  }
  if (homeCard && name) {
    const title = homeCard.querySelector("strong");
    if (title) title.textContent = name;
  }
  if (card && cover) {
    const safeCover = normalizeCoverUrl(cover);
    let coverImg = card.querySelector(".source-card-cover");
    if (!coverImg) {
      coverImg = document.createElement("img");
      coverImg.className = "source-card-cover";
      coverImg.alt = "";
      coverImg.loading = "eager";
      coverImg.decoding = "async";
      card.prepend(coverImg);
    }
    coverImg.src = safeCover;
    card.style.setProperty("--source-cover", `url("${safeCover.replace(/"/g, "%22")}")`);
    card.classList.add("has-source-cover");
  }
  if (homeCard && cover) {
    const safeCover = normalizeCoverUrl(cover);
    homeCard.style.setProperty("--home-playlist-cover", `url('${safeCover.replace(/'/g, "%27")}')`);
    homeCard.classList.add("has-cover");
  }
  document.querySelectorAll(".source-card > span").forEach((caption) => caption.remove());
}

function applyCachedSourceCards() {
  try {
    const cards = JSON.parse(localStorage.getItem(sourceCardCacheKey) || "[]");
    if (Array.isArray(cards)) cards.forEach((card) => updateSourceCardCaption(card.id, card));
  } catch {}
}

function cacheSourceCards(cards = []) {
  try {
    localStorage.setItem(sourceCardCacheKey, JSON.stringify(cards.filter((card) => card?.id)));
  } catch {}
}

function ensureFixedPlaylistCards() {
  const container = document.querySelector(".source-cards");
  if (!container) return;
  fixedNeteasePlaylistIds.forEach((id) => {
    const source = `playlist-${id}`;
    if (container.querySelector(`[data-source="${source}"]`)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "source-card playlist-source";
    button.dataset.source = source;
    button.dataset.playlistId = id;
    button.innerHTML = `<strong>${escapeHtml(fixedNeteasePlaylistNames[id] || `Playlist ${id}`)}</strong>`;
    container.appendChild(button);
  });
  bindFixedPlaylistCards();
}

function currentTrackPlaylistIds(track = state?.track) {
  const ids = new Set();
  const libraryPlaylistId = String(track?.libraryPlaylistId || "").trim();
  if (libraryPlaylistId) ids.add(libraryPlaylistId);
  const playlists = Array.isArray(track?.playlists) ? track.playlists : [];
  for (const item of playlists) {
    const id = String(item?.id || "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

function markCurrentTrackPlaylistMembership(playlist = {}) {
  const playlistId = String(playlist?.id || "").trim();
  if (!playlistId || !state?.track) return;
  const existing = Array.isArray(state.track.playlists) ? state.track.playlists.filter((item) => item?.id || item?.name) : [];
  if (!existing.some((item) => String(item?.id || "").trim() === playlistId)) {
    existing.unshift({
      id: playlistId,
      name: String(playlist.name || playlistId).trim(),
      cover: String(playlist.cover || "").trim(),
      trackCount: Number(playlist.trackCount || 0)
    });
    state.track.playlists = existing.slice(0, 8);
  }
}

async function loadFavoritePlaylistMenu() {
  if (!els.favoritePlaylistMenu) return;
  try {
    const songId = neteaseSongId(state?.track);
    const query = songId ? `?songId=${encodeURIComponent(songId)}` : "";
    const data = await api(`/api/netease-favorite-playlists${query}`);
    const playlists = data.playlists || [];
    const existingPlaylistIds = currentTrackPlaylistIds();
    els.favoritePlaylistMenu.innerHTML = playlists.length
      ? playlists.map((item) => {
        const playlistId = String(item.id || "").trim();
        const alreadyInPlaylist = Boolean(item.containsSong) || existingPlaylistIds.has(playlistId);
        return `
        <button type="button" data-playlist-id="${escapeHtml(item.id)}" data-playlist-name="${escapeHtml(item.name || item.id)}" data-playlist-cover="${escapeHtml(String(item.cover || ""))}" data-playlist-count="${escapeHtml(String(Number(item.trackCount || 0)))}" class="${alreadyInPlaylist ? "existing-member" : ""}" role="menuitem"${alreadyInPlaylist ? " disabled aria-disabled=\"true\" title=\"当前歌曲已在该歌单中\"" : ""}>
          ${item.cover ? `<img src="${escapeHtml(String(item.cover).replace(/^http:/, "https:"))}" alt="">` : ""}
          <span><strong>${escapeHtml(item.name || item.id)}</strong><small>${Number(item.trackCount || 0)} tracks</small></span>
          ${alreadyInPlaylist ? `<em class="favorite-playlist-badge">已添加</em>` : ``}
        </button>
      `;
      }).join("")
      : `<p>没有可用的自定义歌单</p>`;
  } catch {
    els.favoritePlaylistMenu.innerHTML = `<p>读取自定义歌单失败</p>`;
  }
}

function toggleFavoritePlaylistMenu(force) {
  if (!els.favoritePlaylistMenu) return;
  const show = typeof force === "boolean" ? force : els.favoritePlaylistMenu.classList.contains("hidden");
  els.favoritePlaylistMenu.classList.toggle("hidden", !show);
  if (show) toggleQualityMenu(false);
  if (show) {
    loadFavoritePlaylistMenu();
  }
}

async function addCurrentSongToPlaylist(playlistId, button) {
  const songId = neteaseSongId(state?.track);
  if (!songId || !playlistId) return;
  if (currentTrackPlaylistIds().has(String(playlistId || "").trim())) {
    showTransientStatus("当前歌曲已在该歌单中");
    return;
  }
  if (button) button.classList.add("loading");
  try {
    await api("/api/netease-playlist-add", {
      method: "POST",
      body: JSON.stringify({ id: songId, playlistId })
    });
    markCurrentTrackPlaylistMembership({
      id: playlistId,
      name: button?.dataset.playlistName || playlistId,
      cover: button?.dataset.playlistCover || "",
      trackCount: Number(button?.dataset.playlistCount || 0)
    });
    toggleFavoritePlaylistMenu(false);
    showTransientStatus("已收藏到歌单");
  } catch {
    showTransientStatus("收藏失败");
  } finally {
    if (button) button.classList.remove("loading");
  }
}

async function refreshSourceCardCaptions() {
  applyCachedSourceCards();
  try {
    const cardIds = new Set(fixedNeteasePlaylistIds);
    document.querySelectorAll('.source-card[data-source^="playlist-"]').forEach((button) => {
      const id = button.dataset.playlistId || button.dataset.source.replace("playlist-", "");
      if (id) cardIds.add(id);
    });
    const query = [...cardIds].length
      ? `?ids=${encodeURIComponent([...cardIds].join(","))}`
      : "";
    const data = await api(`/api/netease-source-cards${query}`);
    const cards = data.cards || [];
    cards.forEach((card) => updateSourceCardCaption(card.id, card));
    if (cards.length) cacheSourceCards(cards);
  } catch {
    updateSourceCardCaption("daily");
    updateSourceCardCaption("playlist-7067937840");
    updateSourceCardCaption("personal_fm");
  }
}

function openSongidResults(message, source = {}) {
  setSongidView("results");
  els.songidStage?.classList.remove("hidden");
  els.songidResults?.classList.remove("hidden");
  if (els.songidPlayAll) els.songidPlayAll.disabled = true;
  if (els.songidAppendAll) els.songidAppendAll.disabled = true;
  if (els.songidActionMenuBtn) els.songidActionMenuBtn.disabled = true;
  toggleSongidActionMenu(false);
  if (els.songidMeta) els.songidMeta.innerHTML = songidDetailMetaHtml([], source.name || "正在打开", source);
  if (message && els.songidResults && !currentSongidBatch.length) {
    els.songidResults.innerHTML = `<article class="empty-list">${message}</article>`;
  }
}

function toggleSongidActionMenu(force) {
  if (!els.songidActionMenu || !els.songidActionMenuBtn) return;
  const show = typeof force === "boolean" ? force : els.songidActionMenu.classList.contains("hidden");
  els.songidActionMenu.classList.toggle("hidden", !show);
  els.songidActionMenuBtn.setAttribute("aria-expanded", show ? "true" : "false");
}

function openPanel(id) {
  const fromHomePlaylist = playlistOpenedFromHome && id === "playlist";
  if (id !== "playlist") playlistOpenedFromHome = false;
  if (id !== "songid") document.body.classList.remove("songid-detail-open", "songid-search-open");
  document.querySelectorAll(".tabs button").forEach((item) => item.classList.toggle("active", item.dataset.view === id));
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    const visible = panel.id === id;
    panel.classList.toggle("hidden", !visible);
  });
  document.body.classList.toggle("immersive-lyrics-open", id === "profile");
  if (id !== "profile") document.body.classList.remove("lyrics-queue-open");
  document.body.classList.toggle("playlist-opened-from-home", fromHomePlaylist);
  if (id === "profile") {
    if (state?.track) loadLyrics(state.track, { force: true });
    scheduleAlbumReflection();
    scheduleCoverReflectionLayer();
    window.requestAnimationFrame(() => syncLyricsToPlayback({ force: true, behavior: "auto" }));
  } else {
    scheduleCoverReflectionLayer();
  }
}

function openHomePlaylist() {
  playlistOpenedFromHome = true;
  loadSequence();
}

function activePanelId() {
  if (document.body.classList.contains("immersive-lyrics-open")) return "profile";
  return document.querySelector("[data-panel]:not(.hidden)")?.id || "";
}

async function refreshPlaylistPanelIfVisible() {
  if (document.body.classList.contains("immersive-lyrics-open")) {
    if (document.body.classList.contains("lyrics-queue-open")) await refreshPlaybackSequenceViews();
    return;
  }
  if (activePanelId() !== "playlist") return;
  await refreshPlaybackSequenceViews();
}

function schedulePlaylistPanelRefresh({ autoScroll = true } = {}) {
  const immersiveQueueOpen = document.body.classList.contains("immersive-lyrics-open") && document.body.classList.contains("lyrics-queue-open");
  const standalonePlaylistOpen = !document.body.classList.contains("immersive-lyrics-open") && activePanelId() === "playlist";
  if (!immersiveQueueOpen && !standalonePlaylistOpen) return;
  window.clearTimeout(playlistRefreshTimer);
  playlistRefreshTimer = window.setTimeout(() => {
    refreshPlaybackSequenceViews({ autoScroll }).catch(() => {});
  }, 160);
}

function artistCandidates(value) {
  return String(value || "")
    .split(/\s*(?:\/|,|;|、|，|和|feat\.?|ft\.?|with)\s*/i)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function artistLinksHtml(value, className = "artist-link", ids = []) {
  const names = artistCandidates(value);
  if (!names.length) return escapeHtml(value || "");
  const inline = /\binline\b/.test(className);
  return names
    .map((name, index) => {
      const id = Array.isArray(ids) ? String(ids[index] || ids[0] || "") : "";
      const attrs = `data-artist="${escapeHtml(name)}" data-artist-id="${escapeHtml(id)}"`;
      return inline
        ? `<span class="${className}" ${attrs}>${escapeHtml(name)}</span>`
        : `<button class="${className}" type="button" ${attrs}>${escapeHtml(name)}</button>`;
    })
    .join(`<span class="artist-separator"> / </span>`);
}

function albumLinkHtml(name, albumId, className = "album-link", songId = "") {
  const title = String(name || "").trim();
  const id = String(albumId || "").trim();
  const sourceId = String(songId || "").trim();
  if (!title) return "";
  if (!id && !sourceId) return escapeHtml(title);
  return `<button class="${className}" type="button" data-album-id="${escapeHtml(id)}" data-song-id="${escapeHtml(sourceId)}" data-album="${escapeHtml(title)}">${escapeHtml(title)}</button>`;
}

function primaryArtistName(value) {
  return String(value || "").trim();
}

async function loadArtistWorks(artist, artistId = "") {
  const name = primaryArtistName(artist);
  const id = String(artistId || "").trim();
  if (!name && !id) return;
  openPanel("songid");
  setSongidSource("artist");
  openSongidResults(`正在从网易云搜索 ${escapeHtml(name)}...`);
  try {
    const songsPromise = (async () => {
      try {
        const params = id
          ? `id=${encodeURIComponent(id)}&artist=${encodeURIComponent(name)}`
          : `artist=${encodeURIComponent(name)}`;
        return await api(`/api/netease-artist-songs?${params}&limit=50`);
      } catch {
        return await api(`/api/netease-search?q=${encodeURIComponent(name)}&limit=50`);
      }
    })();
    const data = await songsPromise;
    const recommendations = data.recommendations || [];
    const candidateArtistId = id
      || String(recommendations.find((item) => item.artistId)?.artistId || recommendations.find((item) => Array.isArray(item.artistIds) && item.artistIds[0])?.artistIds?.[0] || "").trim();
    let artistSource = {};
    if (candidateArtistId || name) {
      try {
        const params = new URLSearchParams();
        if (candidateArtistId) params.set("id", candidateArtistId);
        if (name) params.set("name", name);
        const introData = await api(`/api/netease-artist-intro?${params.toString()}`);
        artistSource = introData?.source || {};
      } catch {
        artistSource = {};
      }
    }
    setSongidBatch(recommendations, name, {
      kind: "artist",
      id: artistSource.id || id || name,
      name,
      summary: artistSource.summary || "",
      description: artistSource.description || "",
      introduction: Array.isArray(artistSource.introduction) ? artistSource.introduction : [],
      cover: recommendations.find((item) => item.cover)?.cover || "",
      trackCount: artistSource.trackCount || recommendations.length
    });
    refreshSongidResultLikes();
  } catch (error) {
    setSongidBatch([], name, { kind: "artist", id: id || name, name });
    els.songidResults.innerHTML = `<article class="empty-list">打开失败：${escapeHtml(error.message || "网易云搜索失败")}</article>`;
  }
}

async function loadAlbumSongs(albumId, albumName = "", songId = "") {
  const id = String(albumId || "").trim();
  const sourceId = String(songId || "").trim();
  const name = String(albumName || "").trim() || "NetEase Album";
  if (!id && !sourceId) return;
  openPanel("songid");
  setSongidSource(`album-${id || sourceId}`);
  openSongidResults(`正在打开《${escapeHtml(name)}》...`);
  try {
    const endpoint = id
      ? `/api/netease-album?id=${encodeURIComponent(id)}`
      : `/api/netease-album?songId=${encodeURIComponent(sourceId)}`;
    const data = await api(endpoint);
    const recommendations = data.recommendations || [];
    const sourceName = data.source?.name || name;
    setSongidBatch(recommendations, sourceName, {
      ...(data.source || {}),
      kind: "album",
      name: sourceName,
      cover: data.source?.cover || recommendations.find((item) => item.cover)?.cover || "",
      trackCount: data.source?.trackCount || recommendations.length
    });
    refreshSongidResultLikes();
  } catch (error) {
    setSongidBatch([], name, { kind: "album", name });
    els.songidResults.innerHTML = `<article class="empty-list">打开专辑失败：${escapeHtml(error.message || "请确认网易云 API 可用")}</article>`;
  }
}

function cardTrack(card) {
  let tags = [];
  let artistIds = [];
  try {
    tags = JSON.parse(card.dataset.tags || "[]");
  } catch {
    tags = [];
  }
  try {
    artistIds = JSON.parse(card.dataset.artistIds || "[]");
  } catch {
    artistIds = [];
  }
  return {
    sourceId: card.dataset.sourceId,
    title: card.dataset.title,
    artist: card.dataset.artist,
    artistIds,
    artistId: artistIds[0] || "",
    album: card.dataset.album,
    albumId: card.dataset.albumId,
    cover: card.dataset.cover,
    duration: Number(card.dataset.duration || 0),
    libraryPlaylistId: card.dataset.libraryPlaylistId || "",
    tags
  };
}

function trackFromDataset(element) {
  if (!element?.dataset?.sourceId) return null;
  return {
    sourceId: element.dataset.sourceId,
    title: element.dataset.title || "网易云歌曲",
    artist: element.dataset.artist || "未知歌手",
    album: element.dataset.album || "NetEase",
    cover: element.dataset.cover || "",
    duration: Number(element.dataset.duration || 0)
  };
}

function startOptimisticPlayback(track, element) {
  if (!track?.sourceId && !track?.url) return;
  element?.classList.add("loading");
  showTransientStatus("LOADING AUDIO");
  audioContext ||= new AudioContext();
  audioContext?.resume?.().catch(() => {});
  audioUnlockPending = false;
  paint({
    ...(state || {}),
    track: {
      ...(state?.track || {}),
      ...track,
      cover: normalizeCoverUrl(track.cover || "")
    },
    playing: true,
    positionSeconds: 0,
    positionTrackKey: playbackPositionKey(track)
  });
  startAudio(track);
}

function finishOptimisticPlayback(element) {
  element?.classList.remove("loading");
}

async function refreshSongidResultLikes() {
  const cards = [...document.querySelectorAll(".songid-card")];
  if (isLikedCollectionSource()) {
    for (const card of cards) {
      const button = card.querySelector(".songid-like");
      button?.classList.add("liked");
      if (button) button.textContent = "♥";
    }
    return;
  }
  const preLikedCards = new Set(
    cards
      .filter((card) => card.dataset.liked === "1" || String(card.dataset.libraryPlaylistId || "").trim())
      .map((card) => String(card.dataset.sourceId || "").trim())
      .filter(Boolean)
  );
  const ids = cards
    .map((card) => card.dataset.sourceId)
    .filter((id) => id && !preLikedCards.has(String(id).trim()));
  for (const card of cards) {
    if (!preLikedCards.has(String(card.dataset.sourceId || "").trim())) continue;
    const button = card.querySelector(".songid-like");
    button?.classList.add("liked");
    if (button) button.textContent = "♥";
  }
  if (!ids.length) return;
  try {
    const data = await api(`/api/netease-like-check?ids=${encodeURIComponent(ids.join(","))}`);
    const liked = data.liked || {};
    for (const card of cards) {
      const button = card.querySelector(".songid-like");
      const sourceId = String(card.dataset.sourceId || "").trim();
      const isLiked = preLikedCards.has(sourceId) || Boolean(liked[sourceId]);
      button?.classList.toggle("liked", isLiked);
      if (button) button.textContent = isLiked ? "♥" : "♡";
    }
  } catch {
    // The play list should remain usable even if the like status endpoint is unavailable.
  }
}

function songidCards(recommendations = []) {
  return recommendations.length
    ? recommendations.map((item) => {
      const tags = Number.isFinite(Number(item.firstLyricAt))
        ? [`约${Math.round(Number(item.firstLyricAt))}秒开唱`, ...(item.tags || [])]
        : (item.tags || []);
      return `
      <article class="songid-card"
        data-source-id="${escapeHtml(item.sourceId || "")}"
        data-title="${escapeHtml(item.title || "")}"
        data-artist="${escapeHtml(item.artist || "")}"
        data-artist-ids="${escapeHtml(JSON.stringify(item.artistIds || []))}"
        data-album="${escapeHtml(item.album || "")}"
        data-album-id="${escapeHtml(item.albumId || "")}"
        data-cover="${escapeHtml(item.cover || "")}"
        data-duration="${escapeHtml(item.duration || "")}"
        data-library-playlist-id="${escapeHtml(item.libraryPlaylistId || "")}"
        data-liked="${item.liked ? "1" : "0"}"
        data-tags="${escapeHtml(JSON.stringify(item.tags || []))}">
        ${item.cover ? `<img src="${escapeHtml(String(item.cover).replace(/^http:/, "https:"))}" alt="">` : `<div class="songid-cover-fallback"></div>`}
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${songTags(tags)}<span class="song-meta">${artistLinksHtml(item.artist || "")}${item.album ? ` · ${escapeHtml(item.album)}` : ""}</span></small>
        </span>
        <button class="songid-play" type="button" title="播放" aria-label="播放 ${escapeHtml(item.title)}"></button>
        <button class="songid-queue" type="button" title="下一首播放" aria-label="下一首播放 ${escapeHtml(item.title)}"></button>
        <button class="songid-like${item.liked ? " liked" : ""}" type="button" title="红心到网易云账号" aria-label="喜欢 ${escapeHtml(item.title)}">${item.liked ? "♥" : "♡"}</button>
      </article>
    `;
    }).join("")
    : `<article class="empty-list">没有结果</article>`;
}

function addStationMessage(text, recommendations = []) {
  const p = document.createElement("p");
  p.innerHTML = stationMessageHtml(text, recommendations);
  els.chatLog.appendChild(p);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  return p;
}

function addPendingStationMessage() {
  const p = document.createElement("p");
  p.className = "pending";
  p.innerHTML = `<small>Station</small><br>正在想...`;
  els.chatLog.appendChild(p);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  return p;
}

function updateStationMessage(node, text, recommendations = []) {
  if (!node) return addStationMessage(text, recommendations);
  node.classList.remove("pending");
  node.innerHTML = stationMessageHtml(text, recommendations);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  return node;
}

async function sendLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async (position) => {
    const payload = await api("/api/weather/location", {
      method: "POST",
      body: JSON.stringify({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        label: "当前位置"
      })
    });
    paint(payload);
  });
}

document.querySelectorAll(".tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    openPanel(button.dataset.view);
    if (button.dataset.view === "playlist") {
      if (els.playlistInput) els.playlistInput.value = "";
      loadPlaylist("", 0);
    }
    if (button.dataset.view === "songid") {
      loadLocalSongidPlaylist();
    }
  });
});

document.querySelector(".lyrics-panel .panel-sticky")?.addEventListener("click", () => openPanel("home"));

els.cover?.addEventListener("click", () => openPanel(document.body.classList.contains("immersive-lyrics-open") ? "home" : "profile"));
els.cover?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  openPanel(document.body.classList.contains("immersive-lyrics-open") ? "home" : "profile");
});

els.homeQueueOpen?.addEventListener("click", openHomePlaylist);
els.homePlaylistUndo?.addEventListener("click", async (event) => {
  event.stopPropagation();
  if (els.homePlaylistUndo.disabled) return;
  els.homePlaylistUndo.disabled = true;
  try {
    const payload = await api("/api/playlist-undo", { method: "POST" });
    paint(payload, { announce: true });
    showTransientStatus("已回撤播放列表");
    await refreshPlaybackSequenceViews();
  } catch (error) {
    showTransientStatus(error.message || "没有可回撤的播放列表");
  }
});
els.homePlaylistRedo?.addEventListener("click", async (event) => {
  event.stopPropagation();
  if (els.homePlaylistRedo.disabled) return;
  els.homePlaylistRedo.disabled = true;
  try {
    const payload = await api("/api/playlist-redo", { method: "POST" });
    paint(payload, { announce: true });
    showTransientStatus("已恢复播放列表");
    await refreshPlaybackSequenceViews();
  } catch (error) {
    showTransientStatus(error.message || "没有可恢复的播放列表");
  }
});
els.homePlaylistClear?.addEventListener("click", async (event) => {
  event.stopPropagation();
  if (els.homePlaylistClear?.disabled) return;
  await clearSequence();
});
els.homeQueuePrev?.addEventListener("click", () => {
  document.body.classList.add("home-queue-paged");
  homeSequenceViewState.offset = Math.max(0, homeSequenceViewState.offset - sequencePageSize);
  refreshHomeQueuePreview().catch(() => {});
});
els.homeQueueNext?.addEventListener("click", () => {
  document.body.classList.add("home-queue-paged");
  homeSequenceViewState.offset = homeSequenceViewState.offset + sequencePageSize;
  refreshHomeQueuePreview().catch(() => {});
});
els.homePlaylistGrid?.addEventListener("click", (event) => {
  const button = event.target.closest(".home-playlist-card");
  if (!button) return;
  openHomePlaylistSource(button.dataset.source);
});
els.homePlaylistSearchBtn?.addEventListener("click", () => toggleHomePlaylistSearch());
els.homePlaylistSearchCancel?.addEventListener("click", () => toggleHomePlaylistSearch(false));
els.homePlaylistSearch?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runSongidSearch(els.homePlaylistSearchInput?.value || "", { fromHome: true });
});
els.homePlaylistAdd?.addEventListener("click", () => toggleHomePlaylistImport());
els.homePlaylistImportCancel?.addEventListener("click", () => toggleHomePlaylistImport(false));
els.homePlaylistImport?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await importHomePlaylist(els.homePlaylistImportInput?.value || "");
});
els.songidSourceAdd?.addEventListener("click", () => toggleSongidSourceImport());
els.songidSourceImportCancel?.addEventListener("click", () => toggleSongidSourceImport(false));
els.songidSourceImport?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await importSongidPlaylist(els.songidSourceImportInput?.value || "");
});
els.homeChatOpen?.addEventListener("click", () => openPanel("chat"));
els.playlistBack?.addEventListener("click", () => openPanel("home"));
document.querySelectorAll("[data-back-home]").forEach((button) => {
  button.addEventListener("click", () => openPanel("home"));
});
document.querySelector("#profile")?.addEventListener("click", (event) => {
  if (!document.body.classList.contains("immersive-lyrics-open")) return;
  if (!document.body.classList.contains("lyrics-queue-open")) return;
  if (!event.target.closest(".lyric-stage, .lyric-list, .lyric-row, #currentLyric, #nextLyric, .lyric-empty-title, .lyric-empty-meta")) return;
  document.body.classList.remove("lyrics-queue-open");
  showTransientStatus("已收起播放列表");
});
els.homeTaskAdd?.addEventListener("click", () => toggleHomeTaskForm());
els.homeTaskCancel?.addEventListener("click", () => toggleHomeTaskForm(false));
els.homeTaskForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addHomeTaskFromInput();
});
els.homeTaskList?.addEventListener("click", (event) => {
  const button = event.target.closest(".home-task-delete");
  if (!button?.dataset.taskId) return;
  api(`/api/tasks?id=${encodeURIComponent(button.dataset.taskId)}`, { method: "DELETE" })
    .then((data) => {
      homeTasks = Array.isArray(data.tasks) ? data.tasks : homeTasks.filter((task) => task.id !== button.dataset.taskId);
      saveHomeTasks();
      renderHomeTasks();
    })
    .catch(() => {
      homeTasks = homeTasks.filter((task) => task.id !== button.dataset.taskId);
      saveHomeTasks();
      renderHomeTasks();
    });
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    reportPlaybackPosition({ force: true, keepalive: true });
    syncVolumeState({ keepalive: true });
  }
  else syncLyricsToPlayback({ force: true, behavior: "auto" });
});

window.addEventListener("focus", () => {
  syncLyricsToPlayback({ force: true, behavior: "auto" });
});

window.addEventListener("pageshow", () => {
  syncLyricsToPlayback({ force: true, behavior: "auto" });
});

window.addEventListener("pagehide", () => {
  reportPlaybackPosition({ force: true, keepalive: true });
  syncVolumeState({ keepalive: true });
});

let sequenceHotzoneActive = false;
function updateSequenceHotzone(event) {
  const immersive = document.body.classList.contains("immersive-lyrics-open");
  const active = immersive && event && event.clientX >= window.innerWidth - 96;
  if (active === sequenceHotzoneActive) return;
  sequenceHotzoneActive = active;
  document.body.classList.toggle("sequence-hotzone", active);
}

window.addEventListener("pointermove", updateSequenceHotzone, { passive: true });
window.addEventListener("pointerleave", () => {
  sequenceHotzoneActive = false;
  document.body.classList.remove("sequence-hotzone");
});
window.addEventListener("blur", () => {
  sequenceHotzoneActive = false;
  document.body.classList.remove("sequence-hotzone");
});

window.addEventListener("beforeunload", () => {
  reportPlaybackPosition({ force: true, keepalive: true });
  syncVolumeState({ keepalive: true });
});

els.artist?.addEventListener("click", async (event) => {
  const link = event.target.closest(".artist-link");
  await loadArtistWorks(
    link?.dataset.artist || els.artist.dataset.artist || els.artist.textContent,
    link?.dataset.artistId || els.artist.dataset.artistId || ""
  );
});
els.mood?.addEventListener("click", async (event) => {
  const link = event.target.closest(".album-link");
  if (!link?.dataset.albumId && !link?.dataset.songId) return;
  await loadAlbumSongs(link.dataset.albumId, link.dataset.album || link.textContent, link.dataset.songId);
});
els.album?.addEventListener("click", async (event) => {
  const link = event.target.closest(".album-link");
  if (!link?.dataset.albumId && !link?.dataset.songId) return;
  await loadAlbumSongs(link.dataset.albumId, link.dataset.album || link.textContent, link.dataset.songId);
});
els.favoritePlaylist?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleFavoritePlaylistMenu();
});
els.favoritePlaylistMenu?.addEventListener("click", async (event) => {
  event.stopPropagation();
  const button = event.target.closest("button[data-playlist-id]");
  if (!button) return;
  await addCurrentSongToPlaylist(button.dataset.playlistId, button);
});
document.addEventListener("click", (event) => {
  if (!els.favoritePlaylistMenu || els.favoritePlaylistMenu.classList.contains("hidden")) return;
  if (event.target.closest("#favoritePlaylistMenu") || event.target.closest("#favoritePlaylistBtn")) return;
  toggleFavoritePlaylistMenu(false);
});
document.addEventListener("click", (event) => {
  if (!els.qualityMenu || els.qualityMenu.classList.contains("hidden")) return;
  if (event.target.closest("#qualityMenu") || event.target.closest("#qualityBtn")) return;
  toggleQualityMenu(false);
});
document.addEventListener("click", (event) => {
  if (!els.volumeMenu || els.volumeMenu.classList.contains("hidden")) return;
  if (event.target.closest("#volumeMenu") || event.target.closest("#volumeBtn")) return;
  toggleVolumeMenu(false);
});
els.like?.addEventListener("click", async () => {
  const songId = neteaseSongId(state?.track);
  if (!songId) return;
  els.like.textContent = "...";
  els.like.disabled = true;
  try {
    let currentLiked;
    try {
      const latest = await api(`/api/netease-like-check?id=${encodeURIComponent(songId)}`);
      currentLiked = typeof latest?.liked === "boolean"
        ? latest.liked
        : undefined;
    } catch {
      currentLiked = undefined;
    }
    if (typeof currentLiked !== "boolean") {
      currentLiked = typeof state?.track?.liked === "boolean"
        ? state.track.liked
        : els.like.classList.contains("liked");
    }
    const shouldLike = !currentLiked;
    await api("/api/netease-like", {
      method: "POST",
      body: JSON.stringify({ id: songId, like: shouldLike })
    });
    likeStateCache.set(String(songId), shouldLike);
    if (state?.track && String(neteaseSongId(state.track) || "").trim() === String(songId)) {
      state.track = { ...state.track, liked: shouldLike };
    }
    setLikeButtonState(shouldLike);
    showTransientStatus(shouldLike ? "已红心" : "已取消红心");
  } catch (error) {
    setLikeButtonState(typeof state?.track?.liked === "boolean" ? state.track.liked : els.like.classList.contains("liked"));
    showTransientStatus("红心失败");
  } finally {
    els.like.disabled = false;
  }
});
els.desktopLyrics?.addEventListener("click", toggleDesktopLyrics);
els.quality?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleQualityMenu();
});
els.volume?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleVolumeMenu();
});
els.volumeRange?.addEventListener("input", (event) => {
  event.stopPropagation();
  applyVolume(Number(event.target.value) / 100, { sync: true });
});
els.volumeMenu?.addEventListener("click", (event) => {
  event.stopPropagation();
});
els.qualityMenu?.addEventListener("click", async (event) => {
  event.stopPropagation();
  const button = event.target.closest("button[data-quality-level]");
  if (!button) return;
  const level = button.dataset.qualityLevel;
  const data = await api("/api/audio-quality", {
    method: "POST",
    body: JSON.stringify({ level })
  });
  paintAudioQuality(data.level);
  toggleQualityMenu(false);
  showTransientStatus(`音质：${audioQualityLabels[data.level] || data.level}，下一首生效`);
});
els.mode?.addEventListener("click", cyclePlaybackMode);
els.sequence?.addEventListener("click", async () => {
  if (document.body.classList.contains("immersive-lyrics-open")) {
    const showQueue = !document.body.classList.contains("lyrics-queue-open");
    document.body.classList.toggle("lyrics-queue-open", showQueue);
    if (showQueue) {
      if (state?.sequenceState?.items?.length) {
        renderPlaylist({ ...state.sequenceState, sequence: true });
      }
      await loadSequencePanelOnly();
      showTransientStatus("已打开播放列表");
    } else {
      showTransientStatus("已收起播放列表");
    }
    return;
  }
  await refreshHomeQueuePreview();
  if (activePanelId() === "playlist") openPanel("home");
  showTransientStatus("播放序列已刷新");
});
els.play?.addEventListener("pointerdown", handlePlayPointerDown);
els.play?.addEventListener("click", handlePlayClick);
els.next?.addEventListener("click", () => nextTrack("manual"));
els.prev?.addEventListener("click", previousTrack);
els.seek.addEventListener("input", () => {
  seekToSliderValue();
});
els.seek.addEventListener("change", seekToSliderValue);
els.history.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-history");
  if (!button?.dataset.id) return;
  const payload = await api(`/api/history/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE" });
  paint(payload);
});

els.playlistSearch?.addEventListener("submit", (event) => {
  event.preventDefault();
  loadPlaylist(els.playlistInput.value.trim(), 0);
});

els.playlistInput?.addEventListener("input", () => {
  window.clearTimeout(els.playlistInput._timer);
  els.playlistInput._timer = window.setTimeout(() => {
    loadPlaylist(els.playlistInput.value.trim(), 0);
  }, 220);
});

els.playlistPrev?.addEventListener("click", () => {
  if (sequenceItems.length && sequenceViewState.total > 0 && !playlistState.query) {
    refreshPlaybackSequenceViews({ offset: Math.max(0, sequenceViewState.offset - sequencePageSize), loading: true }).catch(() => {});
    return;
  }
  loadPlaylist(playlistState.query, Math.max(0, playlistState.offset - playlistPageSize));
});

els.playlistNext?.addEventListener("click", () => {
  if (sequenceItems.length && sequenceViewState.total > 0 && !playlistState.query) {
    refreshPlaybackSequenceViews({ offset: sequenceViewState.offset + sequencePageSize, loading: true }).catch(() => {});
    return;
  }
  loadPlaylist(playlistState.query, playlistState.offset + playlistPageSize);
});

els.playlistUndo?.addEventListener("click", async () => {
  if (els.playlistUndo.disabled) return;
  els.playlistUndo.disabled = true;
  try {
    const payload = await api("/api/playlist-undo", { method: "POST" });
    paint(payload, { announce: true });
    showTransientStatus("已回到上一个播放列表");
    await refreshPlaylistPanelIfVisible();
  } catch (error) {
    showTransientStatus(error.message || "没有可回撤的播放列表");
  }
});

els.playlistRedo?.addEventListener("click", async () => {
  if (els.playlistRedo.disabled) return;
  els.playlistRedo.disabled = true;
  try {
    const payload = await api("/api/playlist-redo", { method: "POST" });
    paint(payload, { announce: true });
    showTransientStatus("已恢复播放列表");
    await refreshPlaylistPanelIfVisible();
  } catch (error) {
    showTransientStatus(error.message || "没有可恢复的播放列表");
  }
});
els.playlistClear?.addEventListener("click", async () => {
  if (els.playlistClear?.disabled) return;
  await clearSequence();
});

els.playlistList?.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest(".sequence-delete-button");
  if (deleteButton?.dataset.deleteSequence) {
    event.preventDefault();
    event.stopPropagation();
    const item = sequenceItems[Number(deleteButton.dataset.deleteSequence)];
    await deleteSequenceItem(item);
    return;
  }
  const row = event.target.closest(".playlist-row");
  if (row && Object.prototype.hasOwnProperty.call(row.dataset, "sequence")) {
    const localIndex = Number(row.dataset.sequenceLocalIndex ?? row.dataset.sequence);
    const item = sequenceItems[localIndex];
    await playSequenceItem(item, row);
    return;
  }
  if (!row?.dataset.index) return;
  debugClient("library-playlist-row:click", {
    index: Number(row.dataset.index),
    title: row.dataset.title || "",
    sourceId: row.dataset.sourceId || ""
  });
  startOptimisticPlayback(trackFromDataset(row), row);
  try {
    const track = trackFromDataset(row);
    const payload = await api("/api/play", {
      method: "POST",
      body: JSON.stringify({
        index: Number(row.dataset.index),
        sourceId: track.sourceId || "",
        track
      })
    });
    debugClient("library-playlist-row:success", {
      title: payload?.track?.title || "",
      sourceId: payload?.track?.sourceId || payload?.track?.id || ""
    });
    paint(payload, { announce: true });
  } catch (error) {
    debugClient("library-playlist-row:error", {
      index: Number(row.dataset.index),
      message: error?.message || "unknown error",
      title: row.dataset.title || "",
      sourceId: row.dataset.sourceId || ""
    });
    throw error;
  } finally {
    finishOptimisticPlayback(row);
  }
});

els.playlistList?.addEventListener("contextmenu", async (event) => {
  const row = event.target.closest(".playlist-row");
  if (!row?.dataset.sequence) return;
  const localIndex = Number(row.dataset.sequenceLocalIndex ?? row.dataset.sequence);
  const item = sequenceItems[localIndex];
  if (!item || item.source === "current") return;
  event.preventDefault();
  await deleteSequenceItem(item);
});

els.homeQueueList?.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest(".sequence-delete-button");
  if (deleteButton?.dataset.deleteSequence) {
    event.preventDefault();
    event.stopPropagation();
    const item = sequenceItems[Number(deleteButton.dataset.deleteSequence)];
    await deleteSequenceItem(item);
    return;
  }
  const row = event.target.closest(".home-queue-item");
  if (!row?.dataset.homeQueueIndex) return;
  const item = sequenceItems[Number(row.dataset.homeQueueIndex)];
  debugClient("home-queue-row:click", {
    localIndex: Number(row.dataset.homeQueueIndex),
    title: item?.title || "",
    sourceId: item?.sourceId || ""
  });
  await playSequenceItem(item, row);
});

document.addEventListener("keydown", async (event) => {
  const deleteButton = event.target.closest?.(".sequence-delete-button");
  if (!deleteButton?.dataset.deleteSequence) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  event.stopPropagation();
  const item = sequenceItems[Number(deleteButton.dataset.deleteSequence)];
  await deleteSequenceItem(item);
});

els.homeQueueList?.addEventListener("contextmenu", async (event) => {
  const row = event.target.closest(".home-queue-item");
  if (!row?.dataset.homeQueueIndex) return;
  const item = sequenceItems[Number(row.dataset.homeQueueIndex)];
  if (!item || item.source === "current") return;
  event.preventDefault();
  await deleteSequenceItem(item);
});

els.songidSearch?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runSongidSearch(els.songidInput?.value || "");
});

async function loadNeteaseSource(source) {
  setSongidSource(source);
  const label = source === "personal_fm" ? "私人雷达" : "每日推荐";
  openSongidResults(`正在打开${label}...`);
  try {
    const data = await api(`/api/netease-dynamic?source=${encodeURIComponent(source)}`);
    updateSourceCardCaption(source, data);
    setSongidBatch(data.recommendations || [], data.source?.name || (source === "personal_fm" ? "私人雷达" : "每日推荐"), data.source || {});
    refreshSongidResultLikes();
  } catch (error) {
    setSongidBatch([], "NetEase Queue");
    els.songidResults.innerHTML = `<article class="empty-list">打开失败：${escapeHtml(error.message || "请确认网易云 API 已登录")}</article>`;
  }
}

els.dailySource?.addEventListener("click", () => loadNeteaseSource("daily"));
els.fmSource?.addEventListener("click", () => loadNeteaseSource("personal_fm"));

async function loadLocalSongidPlaylist() {
  setSongidSource("local");
  openSongidResults("正在打开我的喜欢...");
  try {
    const data = await api("/api/local-playlist");
    updateSourceCardCaption("local", data);
    setSongidBatch(data.recommendations || [], data.source?.name || "我的喜欢", data.source || {});
    refreshSongidResultLikes();
    openPanel("songid");
  } catch (error) {
    setSongidBatch([], "我的喜欢");
    els.songidResults.innerHTML = `<article class="empty-list">打开失败：${escapeHtml(error.message || "我的喜欢读取失败")}</article>`;
  }
}

$("#localPlaylistBtn")?.addEventListener("click", loadLocalSongidPlaylist);

async function loadFixedNeteasePlaylist(id = "") {
  if (!id) return;
  setSongidSource(`playlist-${id}`);
  const sourceButton = document.querySelector(`.source-card[data-source="${CSS.escape(`playlist-${id}`)}"] strong`);
  const loadingName = sourceButton?.textContent?.trim() || `Playlist ${id}`;
  openSongidResults(`正在打开 ${escapeHtml(loadingName)}...`);
  try {
    const data = await api(`/api/netease-playlist?id=${encodeURIComponent(id)}`);
    updateSourceCardCaption(`playlist-${id}`, data);
    setSongidBatch(data.recommendations || [], data.source?.name || `Playlist ${id}`, data.source || {});
    refreshSongidResultLikes();
    openPanel("songid");
  } catch (error) {
    setSongidBatch([], `Playlist ${id}`);
    els.songidResults.innerHTML = `<article class="empty-list">打开失败：${escapeHtml(error.message || "请确认网易云 API 已登录")}</article>`;
  }
}

function bindSourceCards() {
  const container = document.querySelector(".source-cards");
  if (!container || container.dataset.boundSources) return;
  container.dataset.boundSources = "true";
  container.addEventListener("click", (event) => {
    const button = event.target.closest(".source-card");
    if (!button) return;
    const source = button.dataset.source || "";
    if (source === "local") loadLocalSongidPlaylist();
    else if (source === "daily") loadNeteaseSource("daily");
    else if (source === "personal_fm") loadNeteaseSource("personal_fm");
    else if (source.startsWith("playlist-")) loadFixedNeteasePlaylist(button.dataset.playlistId || source.replace("playlist-", ""));
  });
  container.addEventListener("contextmenu", (event) => {
    const button = event.target.closest(".source-card");
    if (!button) return;
    const source = button.dataset.source || "";
    if (button.dataset.userPlaylist !== "1") return;
    event.preventDefault();
    deleteSongidPlaylistSource(source);
  });
}

function bindFixedPlaylistCards() {
  bindSourceCards();
}
async function playCurrentSongidBatch() {
  if (!currentSongidBatch.length) return;
  const payload = await api("/api/play-batch", {
    method: "POST",
    body: JSON.stringify({
      name: currentSongidBatchName,
      id: currentSongidSource?.id || currentSongidSource?.kind || currentSongidBatchName,
      tracks: decorateBatchTracks(currentSongidBatch, currentSongidBatchName, currentSongidSource?.id || currentSongidSource?.kind || currentSongidBatchName)
    })
  });
  paint(payload, { announce: true });
  await refreshPlaybackSequenceViews();
  toggleSongidActionMenu(false);
}

async function appendCurrentSongidBatch() {
  if (!currentSongidBatch.length) return;
  const payload = await api("/api/append-batch", {
    method: "POST",
    body: JSON.stringify({
      name: currentSongidBatchName,
      id: currentSongidSource?.id || currentSongidSource?.kind || currentSongidBatchName,
      tracks: decorateBatchTracks(currentSongidBatch, currentSongidBatchName, currentSongidSource?.id || currentSongidSource?.kind || currentSongidBatchName)
    })
  });
  paint(payload);
  showTransientStatus("已插入到当前歌曲后方");
  await refreshPlaybackSequenceViews();
  toggleSongidActionMenu(false);
}

els.songidPlayAll?.addEventListener("click", playCurrentSongidBatch);
els.songidAppendAll?.addEventListener("click", appendCurrentSongidBatch);
els.songidEditIntro?.addEventListener("click", openSongidIntroEditor);
els.songidMeta?.addEventListener("click", (event) => {
  const button = event.target.closest(".songid-intro-toggle");
  if (!button) return;
  const line = button.closest(".songid-intro-line");
  if (!line) return;
  const panel = document.querySelector("#songid");
  if (!panel) return;
  const expanded = panel.classList.toggle("songid-intro-expanded");
  const summary = String(line.dataset.summary || "").trim();
  const full = String(line.dataset.full || "").trim();
  const paragraph = line.querySelector("p");
  if (paragraph) paragraph.textContent = expanded ? (full || summary) : summary;
  button.textContent = expanded ? "▴" : "▾";
  button.setAttribute("aria-label", expanded ? "收起简介" : "展开简介");
  button.setAttribute("aria-expanded", String(expanded));
});
els.songidActionMenuBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  if (!currentSongidBatch.length) return;
  toggleSongidActionMenu();
});
els.songidActionMenu?.addEventListener("click", async (event) => {
  event.stopPropagation();
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "append") await appendCurrentSongidBatch();
  else await playCurrentSongidBatch();
});
document.addEventListener("click", (event) => {
  if (els.songidActionMenu?.classList.contains("hidden")) return;
  if (event.target.closest(".songid-actions")) return;
  toggleSongidActionMenu(false);
});

els.songidBack?.addEventListener("click", () => {
  openPanel("home");
});

els.chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = els.chatInput.value.trim();
  if (!message) return;
  els.chatInput.value = "";
  addChat("me", message);
  const pending = addPendingStationMessage();
  try {
    const { reply, recommendations = [], memory } = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message })
    });
    updateChatMemory(memory);
    updateStationMessage(pending, reply, recommendations);
    try {
      const latest = await api("/api/now");
      if (trackKey(latest?.track) !== trackKey(state?.track) || Boolean(latest?.playing) !== Boolean(state?.playing)) {
        paint(latest, { announce: true });
      }
    } catch {}
  } catch (error) {
    updateStationMessage(pending, `这条回复失败了：${error.message || "网络或服务异常"}`);
  }
});

els.chatLog.addEventListener("click", async (event) => {
  const artistLink = event.target.closest(".artist-link");
  if (artistLink?.dataset.artist) {
    await loadArtistWorks(artistLink.dataset.artist, artistLink.dataset.artistId);
    return;
  }
  const appendAll = event.target.closest(".chat-append-all");
  if (appendAll?.dataset.chatBatch) {
    try {
      const tracks = JSON.parse(decodeURIComponent(appendAll.dataset.chatBatch));
      if (!Array.isArray(tracks) || !tracks.length) return;
      const payload = await api("/api/append-batch", {
        method: "POST",
        body: JSON.stringify({
          name: "Chat 推荐",
          id: "chat-recommendations",
          tracks: decorateBatchTracks(tracks, "Chat 推荐", "chat-recommendations")
        })
      });
      paint(payload, { announce: false });
      showTransientStatus("已把整批候选追加到当前队列");
      await refreshPlaybackSequenceViews();
    } catch {
      showTransientStatus("追加全部失败");
    }
    return;
  }
  const card = event.target.closest(".song-card");
  if (!card?.dataset.index) return;
  try {
    const payload = await api("/api/append-batch", {
      method: "POST",
      body: JSON.stringify({
        name: "Chat 推荐",
        id: "chat-recommendations",
        tracks: [{
          sourceId: card.dataset.sourceId,
          title: card.dataset.title,
          artist: card.dataset.artist,
          album: card.dataset.album,
          cover: card.dataset.cover,
          duration: Number(card.dataset.duration || 0)
        }].map((track) => decorateBatchTracks([track], "Chat 推荐", "chat-recommendations")[0])
      })
    });
    paint(payload, { announce: false });
    showTransientStatus("已加入当前队列");
    await refreshPlaybackSequenceViews();
  } catch {
    showTransientStatus("加入队列失败");
  }
});

els.songidResults?.addEventListener("click", async (event) => {
  const albumLink = event.target.closest(".album-link");
  if (albumLink?.dataset.albumId || albumLink?.dataset.songId) {
    await loadAlbumSongs(albumLink.dataset.albumId, albumLink.dataset.album || albumLink.textContent, albumLink.dataset.songId);
    return;
  }
  const artistLink = event.target.closest(".artist-link");
  if (artistLink?.dataset.artist) {
    await loadArtistWorks(artistLink.dataset.artist, artistLink.dataset.artistId);
    return;
  }
  const card = event.target.closest(".songid-card");
  if (!card) return;
  if (event.target.closest(".song-meta") && (card.dataset.albumId || card.dataset.sourceId) && !event.target.closest(".artist-link")) {
    await loadAlbumSongs(card.dataset.albumId, card.dataset.album, card.dataset.sourceId);
    return;
  }
  if (event.target.closest(".songid-like")) {
    const button = event.target.closest(".songid-like");
    const shouldLike = !button.classList.contains("liked");
    button.textContent = "...";
    try {
      await api("/api/netease-like", {
        method: "POST",
        body: JSON.stringify({ id: card.dataset.sourceId, like: shouldLike })
      });
      likeStateCache.set(String(card.dataset.sourceId || "").trim(), shouldLike);
      button.textContent = shouldLike ? "♥" : "♡";
      button.classList.toggle("liked", shouldLike);
      card.dataset.liked = shouldLike ? "1" : "0";
    } catch {
      button.textContent = button.classList.contains("liked") ? "♥" : "♡";
      showTransientStatus("LIKE FAILED");
    }
    return;
  }
  if (event.target.closest(".songid-queue")) {
    const button = event.target.closest(".songid-queue");
    button.classList.add("loading");
    button.textContent = "...";
    try {
      const payload = await api("/api/queue-next", {
        method: "POST",
        body: JSON.stringify({
          track: cardTrack(card)
        })
      });
      button.classList.remove("loading");
      button.classList.add("queued");
      button.textContent = "✓";
      showTransientStatus("NEXT UP");
      paint(payload);
      await refreshPlaybackSequenceViews({ autoScroll: false });
      window.setTimeout(() => {
        button.classList.remove("queued");
        button.textContent = "";
      }, 900);
    } catch {
      button.classList.remove("loading", "queued");
      button.textContent = "";
      showTransientStatus("QUEUE FAILED");
    }
    return;
  }
  const track = cardTrack(card);
  startOptimisticPlayback(track, card);
  try {
    const payload = await api("/api/play", {
      method: "POST",
      body: JSON.stringify({ track })
    });
    paint(payload, { announce: true });
  } finally {
    finishOptimisticPlayback(card);
  }
});

const isDesktopShell = new URLSearchParams(window.location.search).get("desktop") === "1";
if ("serviceWorker" in navigator && !isDesktopShell) navigator.serviceWorker.register("/sw.js");

window.addEventListener("resize", scheduleAlbumReflection);
els.coverArt?.addEventListener("load", scheduleAlbumReflection);
window.addEventListener("load", scheduleAlbumReflection);
window.setTimeout(scheduleAlbumReflection, 800);
window.addEventListener("resize", scheduleCoverReflectionLayer);
els.coverArt?.addEventListener("load", scheduleCoverReflectionLayer);
window.addEventListener("load", scheduleCoverReflectionLayer);
window.setTimeout(scheduleCoverReflectionLayer, 800);

const events = new EventSource("/api/stream");
events.addEventListener("message", (event) => paint(JSON.parse(event.data)));

updateClock();
setInterval(updateClock, 1000);
drawScope();
ensureFixedPlaylistCards();
loadTaste();
loadPlaylist();
loadHomeTasksFromServer();
refreshHomeQueuePreview();
refreshHomePlaylists();
loadAudioQuality();
refreshSourceCardCaptions();
sendLocation();
api("/api/now").then(paint);


