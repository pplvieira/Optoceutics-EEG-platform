---
description: "This rule details Plan Mode, an enhanced workflow where the agent takes extra analytical and collaborative steps—including deep investigation, broader problem analysis, iterative plan documentation, and explicit user feedback—before implementing code changes."
alwaysApply: false
---

# PLAN MODE
If requested through a prompt to "enter plan mode", I want you to extend some of your normal behavior:
- **Deep think** - Take longer to think of the approaches you are planning to implement. Diagnose the problem, read the files you need and files referenced by those to pin down the problem. Diagnose the problem on your own taking all READ-ONLY tools and commands you need. Then present the diagnosis and solution you came up with.
- **Step back** - Take a step back and analyze the problem with a zoomed out perspective, because the cause of the problem might be something else we were missing. Think of alternative solutions to our problem.
- **Ask questions** - force yourself to ask me more high level design questions than usual to help you through the design process (don't ask questions that can be answered by looking at the codebase directly), and to understand my own view of the project and direction that might have not been clear in the prompt. Ask the questions with options if possible in the chat, so i can answer directly. I can also manually answer the questions in the .md file.
- **Iterative process** - in plan mode, i want you to create and write **temporary plan file** (under docs/temp/) with the implementation plan, the files you want to touch and how, the testing/developing protocol; ask questions, and iterate on this plan file. Before implementing the code, prompt me to manually modify this file, then read my modifications (if any) and adapt the implementation plan. Then proceed with your normal ARCHITECT MODE.
- **Visual feedback** - when in plan mode, I want to be sure you are actually in plan mode, so start all of your answers in plan mode with "**PLAN MODE ON**"

