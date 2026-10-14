"""Gera o 'Ouvir e conferir.html' na pasta de saída do afinador: as notas desenhadas
(antes em cinza, depois em cor), os acordes em cima, as dúvidas marcadas, e o
player que troca entre antes e depois sem perder o ponto da música."""
import json
import os
import sys

import numpy as np

MODELO = r"""<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Afinador Boss</title>
<style>
:root{--fundo:#f6f5f2;--cartao:#fff;--texto:#1b1b1f;--fraco:#77767d;--linha:#e3e1dc;--faixa:#efede8;
--antes:#b9b6ae;--depois:#4b3cf0;--guia:#e2a400;--duvida:#e5484d;--improviso:#12a37f}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--fundo:#121215;--cartao:#1b1b20;--texto:#ecebf0;
--fraco:#8d8b96;--linha:#2b2a31;--faixa:#202026;--antes:#55535c;--depois:#8b80ff;--guia:#f5c542;--duvida:#ff6b6f;--improviso:#3fd4a8}}
:root[data-theme="dark"]{--fundo:#121215;--cartao:#1b1b20;--texto:#ecebf0;--fraco:#8d8b96;--linha:#2b2a31;--faixa:#202026;
--antes:#55535c;--depois:#8b80ff;--guia:#f5c542;--duvida:#ff6b6f;--improviso:#3fd4a8}
*{box-sizing:border-box}body{margin:0;background:var(--fundo);color:var(--texto);font:15px/1.45 -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif}
main{max-width:1200px;margin:0 auto;padding:28px 16px 60px}
h1{font-size:26px;margin:0 0 4px;letter-spacing:-.02em}.sub{color:var(--fraco);margin:0 0 20px}
.fichas{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}
.ficha{background:var(--cartao);border:1px solid var(--linha);border-radius:12px;padding:10px 14px}
.ficha b{display:block;font-size:18px}.ficha span{color:var(--fraco);font-size:13px}
.player{position:sticky;top:0;z-index:5;background:var(--fundo);padding:10px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
button{font:inherit;border:1px solid var(--linha);background:var(--cartao);color:var(--texto);border-radius:999px;padding:8px 16px;cursor:pointer}
button.ativo{background:var(--depois);border-color:var(--depois);color:#fff}
#tempo{font-variant-numeric:tabular-nums;color:var(--fraco);min-width:90px}
.rolo{background:var(--cartao);border:1px solid var(--linha);border-radius:14px;overflow-x:auto;overflow-y:hidden}
canvas{display:block}
.legenda{display:flex;gap:16px;flex-wrap:wrap;color:var(--fraco);font-size:13px;margin:10px 2px 22px}
.legenda i{display:inline-block;width:14px;height:4px;border-radius:2px;margin-right:6px;vertical-align:middle}
h2{font-size:18px;margin:26px 0 10px}
.lista{display:grid;gap:8px}
.item{background:var(--cartao);border:1px solid var(--linha);border-radius:12px;padding:10px 14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.item .t{font-variant-numeric:tabular-nums;color:var(--fraco);min-width:58px}
.tag{font-size:12px;border-radius:999px;padding:2px 9px;border:1px solid currentColor}
.tag.d{color:var(--duvida)}.tag.i{color:var(--improviso)}.tag.g{color:var(--guia)}
.vazio{color:var(--fraco)}
</style></head><body><main>
<h1>Afinador Boss</h1>
<p class="sub" id="sub"></p>
<div class="fichas" id="fichas"></div>
<div class="player">
  <button id="play">▶ Tocar</button>
  <button id="bAntes">Antes</button><button id="bDepois" class="ativo">Depois</button>
  <button id="bVoz">Só a voz</button>
  <span id="tempo">0:00</span>
</div>
<div class="rolo" id="rolo"><canvas id="tela"></canvas></div>
<div class="legenda">
  <span><i style="background:var(--antes)"></i>como cantou</span>
  <span><i style="background:var(--depois)"></i>depois de afinar</span>
  <span><i style="background:var(--guia)"></i>melodia guia</span>
  <span><i style="background:var(--duvida)"></i>dúvida</span>
  <span><i style="background:var(--improviso)"></i>improviso mantido</span>
</div>
<h2>Para conferir</h2>
<div class="lista" id="lista"></div>
<audio id="aAntes" preload="auto" src="Mix teste - antes.wav"></audio>
<audio id="aDepois" preload="auto" src="Mix teste - depois.wav"></audio>
<audio id="aVoz" preload="auto" src="__VOZ__"></audio>
</main>
<script>
const R = __DADOS__;
const NOMES=['dó','dó#','ré','ré#','mi','fá','fá#','sol','sol#','lá','lá#','si'];
const nome=m=>NOMES[((m%12)+12)%12]+(Math.floor(m/12)-1);
const mmss=t=>Math.floor(t/60)+':'+(t%60).toFixed(1).padStart(4,'0');
const cor=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
document.getElementById('sub').textContent=`Modo ${R.modo} · ${R.bpm} BPM · referência ${R.afinacao_referencia_cents>=0?'+':''}${R.afinacao_referencia_cents} cents de A=440`;
const n=R.notas, mexidas=n.filter(x=>Math.abs(x.mexeu)>=.1).length, grandes=n.filter(x=>Math.abs(x.mexeu)>=.75).length;
const duv=n.filter(x=>x.duvida).length, imp=n.filter(x=>x.motivo.includes('improviso')).length;
const fichas=[[R.escalas.map(e=>e.escala).filter((v,i,a)=>a.indexOf(v)===i).join(' → '),'escala'],
 [n.length,'notas cantadas'],[mexidas,'corrigidas'],[grandes,'correções grandes'],[duv,'dúvidas'],[imp,'improvisos mantidos']];
document.getElementById('fichas').innerHTML=fichas.map(([v,l])=>`<div class="ficha"><b>${v}</b><span>${l}</span></div>`).join('');

const PX=150, ALT=480, TOPO=30;
const dur=R.duracao, tela=document.getElementById('tela'), ctx=tela.getContext('2d');
let [lo,hi]=R.faixa;
const y=m=>TOPO+(hi-m)/(hi-lo)*(ALT-TOPO-10);
function desenhar(agora){
  const dpr=window.devicePixelRatio||1, W=Math.ceil(dur*PX);
  tela.width=W*dpr; tela.height=ALT*dpr; tela.style.width=W+'px'; tela.style.height=ALT+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,ALT);
  const esc=new Set((R.escalas_notas||[]));
  for(let m=lo;m<=hi;m++){ if(esc.has(((m%12)+12)%12)){ctx.fillStyle=cor('--faixa');ctx.fillRect(0,y(m+.5),W,y(m-.5)-y(m+.5));}
    if(m%12===0){ctx.fillStyle=cor('--fraco');ctx.font='11px sans-serif';ctx.fillText(nome(m),4,y(m)+4);} }
  ctx.font='12px sans-serif';
  let ultimo=-99;
  for(const a of R.acordes){ if(a.acorde==='-')continue; ctx.fillStyle=cor('--linha'); ctx.fillRect(a.t0*PX,0,1,ALT);
    if(a.t0*PX-ultimo<42)continue; ctx.fillStyle=cor('--fraco'); ctx.fillText(a.acorde,a.t0*PX+4,18); ultimo=a.t0*PX; }
  for(const x of n){ if(x.guia===null)continue; ctx.strokeStyle=cor('--guia'); ctx.lineWidth=1.5;
    ctx.strokeRect(x.t0*PX,y(x.guia+.4),(x.t1-x.t0)*PX,y(x.guia-.4)-y(x.guia+.4)); }
  const linha=(c,v,w)=>{ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();let on=false;
    v.forEach((m,i)=>{if(m===null){on=false;return;}const X=i*R.quadro*PX,Y=y(m);on?ctx.lineTo(X,Y):ctx.moveTo(X,Y);on=true;});ctx.stroke();};
  linha(cor('--antes'),R.curva_antes,3.5); linha(cor('--depois'),R.curva_depois,2);
  for(const x of n){ if(!(x.duvida||x.motivo.includes('improviso')))continue;
    ctx.strokeStyle=cor(x.duvida?'--duvida':'--improviso'); ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc((x.t0+x.t1)/2*PX,y(x.alvo),14,0,7); ctx.stroke(); }
  if(agora!==undefined){ctx.fillStyle=cor('--depois');ctx.fillRect(agora*PX,0,2,ALT);}
}
desenhar(0);
const A={antes:document.getElementById('aAntes'),depois:document.getElementById('aDepois'),voz:document.getElementById('aVoz')};
let qual='depois';
const botoes={antes:document.getElementById('bAntes'),depois:document.getElementById('bDepois'),voz:document.getElementById('bVoz')};
// carrega o áudio inteiro na memória (assim dá para pular para qualquer ponto em qualquer servidor)
for(const k in A){const el=A[k];fetch(el.getAttribute('src')).then(r=>r.ok?r.blob():null).then(b=>{if(b){const t=el.currentTime;el.src=URL.createObjectURL(b);irPara(el,t,false);}}).catch(()=>{});}
function irPara(el,t,tocar){const f=()=>{el.currentTime=t;if(tocar)el.play();};el.readyState>=1?f():el.addEventListener('loadedmetadata',f,{once:true});}
function trocar(novo){const t=A[qual].currentTime,tocando=!A[qual].paused;A[qual].pause();qual=novo;irPara(A[qual],t,tocando);
  for(const k in botoes)botoes[k].classList.toggle('ativo',k===novo);}
for(const k in botoes)botoes[k].onclick=()=>trocar(k);
const play=document.getElementById('play');
play.onclick=()=>{A[qual].paused?A[qual].play():A[qual].pause();};
for(const k in A){A[k].onplay=()=>play.textContent='❚❚ Pausar';A[k].onpause=()=>play.textContent='▶ Tocar';}
const rolo=document.getElementById('rolo');
function quadro(){const t=A[qual].currentTime;document.getElementById('tempo').textContent=mmss(t);desenhar(t);
  if(!A[qual].paused){const x=t*PX;if(x<rolo.scrollLeft+60||x>rolo.scrollLeft+rolo.clientWidth-120)rolo.scrollLeft=x-120;}
  requestAnimationFrame(quadro);}
requestAnimationFrame(quadro);
tela.onclick=e=>{const r=tela.getBoundingClientRect();irPara(A[qual],(e.clientX-r.left)/PX,!A[qual].paused);};
const lista=n.filter(x=>x.duvida||x.motivo||Math.abs(x.mexeu)>=.75);
document.getElementById('lista').innerHTML=lista.length?lista.map((x,i)=>`<div class="item"><span class="t">${mmss(x.t0)}</span>
 <span>cantou <b>${x.cantou_nome}</b> → <b>${x.alvo_nome}</b> (${x.mexeu>0?'+':''}${x.mexeu.toFixed(2)} semitom)</span>
 ${x.duvida?`<span class="tag d">dúvida, outra opção ${nome(x.alternativa)}</span>`:''}
 ${x.motivo.includes('improviso')?'<span class="tag i">improviso mantido</span>':''}
 ${x.motivo.includes('guia')?'<span class="tag g">pela melodia guia</span>':''}
 ${x.motivo.includes('repeti')?'<span class="tag g">pelas repetições</span>':''}
 <button data-t="${x.t0}">Ouvir</button></div>`).join(''):'<p class="vazio">Nada para conferir.</p>';
document.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{const t=Math.max(0,+b.dataset.t-1.5);irPara(A[qual],t,true);
  rolo.scrollLeft=t*PX-60;});
</script></body></html>"""


def _mp3_embutido(caminho):
    """Converte para MP3 e devolve como data URI (a página funciona sozinha, sem os WAV do lado)."""
    import base64
    import io
    import soundfile as sf
    y, sr = sf.read(caminho, always_2d=True)
    buf = io.BytesIO()
    sf.write(buf, y, sr, format='MP3', subtype='MPEG_LAYER_III', compression_level=0.2)
    return 'data:audio/mpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


def gerar(pasta, voz_arquivo, midi, curva, quadro=0.01, embutir=False):
    with open(os.path.join(pasta, 'relatorio.json')) as f:
        r = json.load(f)
    ref = r['afinacao_referencia_cents'] / 100.0
    antes = midi - ref
    depois = antes + curva[:len(antes)]
    r['quadro'] = quadro * 2
    r['curva_antes'] = [None if np.isnan(v) else round(float(v), 2) for v in antes[::2]]
    r['curva_depois'] = [None if np.isnan(v) else round(float(v), 2) for v in depois[::2]]
    r['duracao'] = len(midi) * quadro
    validos = antes[~np.isnan(antes)]
    r['faixa'] = [float(np.floor(np.percentile(validos, 1)) - 2), float(np.ceil(np.percentile(validos, 99)) + 2)]
    r['escalas_notas'] = r.get('escalas_notas', [])
    html = MODELO.replace('__DADOS__', json.dumps(r, ensure_ascii=False)).replace('__VOZ__', voz_arquivo)
    destino = os.path.join(pasta, 'Ouvir e conferir.html')
    if embutir:
        for nome in ('Mix teste - antes.wav', 'Mix teste - depois.wav', voz_arquivo):
            html = html.replace(f'src="{nome}"', f'src="{_mp3_embutido(os.path.join(pasta, nome))}"')
        destino = os.path.join(pasta, 'Ouvir e conferir (com áudio).html')
    with open(destino, 'w') as f:
        f.write(html)
    return destino


if __name__ == '__main__':
    pasta = sys.argv[1]
    voz = [f for f in os.listdir(pasta) if f.endswith('[afinada].wav')][0]
    cache = [f for f in os.listdir(pasta) if f.startswith('_cache_') and '[afinada]' not in f and 'limpa' not in f][0]
    embutir = '--embutir' in sys.argv
    print(gerar(pasta, voz, np.load(os.path.join(pasta, cache)), np.load(os.path.join(pasta, '_curva.npy')), embutir=embutir))
