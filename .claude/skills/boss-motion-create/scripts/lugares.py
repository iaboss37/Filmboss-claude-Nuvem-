"""Onde as coisas ficam, no Mac do Rick e na nuvem (Claude Code na web, Linux).

BASE      motor instalado (venv e node_modules da base do Remotion): ~/FilmbossTools/boss-motion ou $BOSS_MOTION_BASE
PROJETOS  estudos: no Mac em BASE/projetos; na nuvem dentro do repositório, em boss-motion/projetos (fora do git),
          para o Rick conseguir abrir as fichas e vídeos pelo app. $BOSS_MOTION_PROJETOS troca.
SKILLS    onde a skill de estilo é gerada: no Mac ~/.claude/skills; na nuvem <repositório>/.claude/skills,
          para ir para o GitHub com um commit e valer nas próximas sessões. $BOSS_MOTION_SKILLS troca.
"""
import os, sys

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NO_MAC = sys.platform == "darwin"
BASE = os.environ.get("BOSS_MOTION_BASE") or os.path.expanduser("~/FilmbossTools/boss-motion")


def raiz_repo():
    """Pasta do repositório quando a skill mora em <repositório>/.claude/skills/<skill> (e não em ~/.claude/skills)."""
    skills = os.path.dirname(SKILL); claude = os.path.dirname(skills); raiz = os.path.dirname(claude)
    if os.path.basename(skills) == "skills" and os.path.basename(claude) == ".claude" and raiz != os.path.expanduser("~"):
        return raiz
    return None


RAIZ_REPO = raiz_repo()
NUVEM = not NO_MAC and RAIZ_REPO is not None
PROJETOS = os.environ.get("BOSS_MOTION_PROJETOS") or (os.path.join(RAIZ_REPO, "boss-motion", "projetos") if NUVEM else os.path.join(BASE, "projetos"))
SKILLS = os.environ.get("BOSS_MOTION_SKILLS") or (os.path.join(RAIZ_REPO, ".claude", "skills") if NUVEM else os.path.expanduser("~/.claude/skills"))
