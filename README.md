# Upstack

**Every setback is a step.**

A Sims-style isometric mini game about breaking into tech from zero. You play as me (my own Blender / Ready Player Me avatar), climbing from a tiny bedroom to the summit while setbacks rain down, each one labelled with something every self-taught developer has faced: *"Am I cut out for this?"*, *"Rejected"*, *"Imposter syndrome"*.

Dodge them. Then pick them up, because every setback you turn into a lesson becomes a stone step toward the next level.

## Gameplay

| Mechanic | How it works |
| --- | --- |
| Needs | Energy, Coffee, Focus and Confidence drain over time. Refill them at the bed, coffee station and chill corner. |
| Pie menu | Click any object for a Sims-style radial menu of actions. Actions queue up (top left). |
| Setbacks | Setbacks fly in from the shadowy Doubts around each island. A red circle shows where each one lands. Getting hit costs Confidence. |
| Lessons | Landed setbacks stay put. Click one and choose **Turn into a lesson** to build a stair step. |
| Milestones | Work at the desk to finish each chapter's milestone. Low needs slow you down or stop you. |
| Collapse states | Confidence at zero triggers a doubt spiral. Energy at zero makes you pass out. |

**Chapters:** Ground Zero (self-taught) → The Job Hunt → First Job → The Summit.

**Controls:** click floor or WASD to move · click objects for actions · Q/E rotate · scroll to zoom · Space pause · 1-3 speed.

## Tech

- [Three.js](https://threejs.org/) with an orthographic isometric camera, soft shadows and low-poly procedural props
- Procedural skeletal animation: the avatar ships with no animation clips, so every pose (walk, run, type, sleep, drink, cheer, dodge) is generated in code by aiming limb bones at target directions
- WebAudio for all sound effects, the lo-fi music loop and the Simlish-style babble
- Vite build, deployed to GitHub Pages with GitHub Actions

## Run locally

```bash
npm install
npm run dev
```

## Deploy

Pushing to `main` builds and deploys automatically via `.github/workflows/deploy.yml`. In the repo settings, set **Pages → Source** to **GitHub Actions**.

---

Made by [Thusala](https://thusala.me).
