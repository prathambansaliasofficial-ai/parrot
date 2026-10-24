# Parrot AI

> **Learn by teaching. Study with your own university’s material.**
>
> Parrot AI is an agentic study companion being built for **Fetch-A-Thon 3.0**. It brings FreeResources.in study materials and an interactive AI tutor together, so students can practise, explain concepts, and get feedback without moving between separate study tools.

## Project links

- **FreeResources.in:** https://freeresources.in
- **Parrot AI source repository:** https://github.com/prathambansaliasofficial-ai/parrot
- **Hackathon:** Fetch-A-Thon 3.0 — powered by ASI:1
- **Demo, presentation, team, and additional resources:** links will be added here

## The problem

Students often prepare for an exam by collecting notes, previous questions, assignments, reference books, tests, and syllabus documents from different places. To get AI help, they may then have to download those resources and upload them again to another product. That breaks the study flow and makes it harder to keep an AI tutor focused on the material and exam pattern of a particular college or university.

A general-purpose chatbot can explain a topic, but it may not know which parts of that topic matter for a student’s course or what their university tends to ask.

## Our idea

**FreeResources.in** is intended to organize academic resources by institution and course. **Parrot AI** is the study agent that works alongside those resources throughout the site.

A student should be able to open a relevant resource and ask Parrot to help them study it. Parrot can guide active recall: it asks a question, listens to the student’s explanation, checks it against the available course material, and gives feedback or a follow-up question. The student learns by trying to teach the concept back—like explaining it to a curious parrot.

The goal is to make study preparation feel like a focused learning session, not another file-upload workflow.

## What students can do

The planned experience brings together:

- **Study from institution-specific resources.** Use the materials associated with a student’s college, course, and subject as the study context.
- **Practise active recall.** Ask Parrot to quiz you on a topic, answer in your own words, and receive feedback grounded in the material.
- **Prepare for assessments.** Use previous questions, assignments, notes, reference books, tests, and syllabus material to guide revision.
- **Work with resources in place.** Ask questions about a resource without manually downloading it and re-uploading it to a separate AI app.
- **Take study actions through agents and integrations.** The planned direction includes creating study notes and coordinating with connected academic tools such as Notion and Google Calendar.
- **Practise coding in context.** For coding subjects, the planned experience includes an on-site coding practice panel.
- **Use OCR on learning material.** The planned experience includes extracting text from relevant images or scanned resources within the study flow.

These are product goals for the prototype, not a claim that every integration or feature is already implemented.

## Resource types

FreeResources.in is planned to organize course material in five categories:

1. Previous questions
2. Assignments
3. Notes
4. Reference books
5. Tests and syllabus material

For the hackathon demonstration, the project will use clearly identified demo or sample content. Institution-specific resources are intended to keep explanations and practice relevant to the course rather than drawing only on broad, unrelated material.

## Agentic AI and the Fetch.ai / ASI stack

Fetch-A-Thon 3.0 is about building useful AI agents that can work with tools and services, take actions, and solve real problems. Parrot is designed around that idea: it should be able to retrieve relevant study context, run a learning interaction, and—where a connected tool is available and authorized—carry out a study task.

The planned Fetch.ai / ASI integration is a core part of the project:

- **Fetch.ai uAgents (Python):** the agent framework for defining Parrot’s agent behavior, message handling, and interactions with tools.
- **Agentverse:** the Fetch.ai platform for agent registration, discovery, inspection, and hosted mailbox connectivity where appropriate.
- **ASI:One / ASI:1:** the ASI ecosystem’s agent-facing AI capability for interpreting requests and supporting agentic workflows.
- **Agent Chat Protocol and MCP tooling:** the planned interoperability layer for exposing or invoking clearly described tools and connecting the Parrot agent with the Fetch.ai ecosystem. The exact interface will follow the selected Agentverse and ASI:One integration path.

Fetch.ai’s uAgents ecosystem is intended to provide the agent layer. The application’s web interface, resource storage, and product-specific retrieval remain application components; they are not represented as built-in Fetch.ai features.

## Proposed technical stack

The implementation is being planned around the following stack. The repository is at the initial stage, so this section describes the intended architecture rather than claiming that these components are already deployed.

| Layer | Planned technology | Purpose |
| --- | --- | --- |
| Web application | Next.js, React, TypeScript, Tailwind CSS | FreeResources.in experience and the persistent Parrot study interface |
| Application API | Python with FastAPI | User sessions, resource access, and communication between the web app and agent services |
| Agent runtime | Fetch.ai uAgents | Parrot’s agent behavior and tool-oriented workflows |
| Agent platform | Agentverse | Registration, discovery, monitoring, and mailbox connectivity as needed |
| Agent intelligence | ASI:One / ASI:1 | Support natural-language requests and agentic task selection |
| Tool interoperability | Agent Chat Protocol and MCP-compatible tools | Connect the agent to application capabilities and supported external services |
| Resource retrieval | PostgreSQL with pgvector (planned) | Store structured resource metadata and retrieve relevant text passages |
| File storage | S3-compatible object storage (planned) | Keep uploaded PDFs and other course files |
| Integrations | Authorized provider APIs and OAuth connections (planned) | Connect supported services such as Notion and Google Calendar |

The first working prototype will prioritize the core loop: **select a demo course resource → ask Parrot to quiz you → explain your answer → receive material-grounded feedback**. External integrations and additional study tools can be added incrementally.

### Why the Fetch.ai / ASI components matter

The hackathon-relevant implementation is not just an AI chat interface. Parrot is planned as a uAgent that can participate in Fetch.ai’s agent ecosystem and use explicit tools to retrieve course material and perform study tasks. Agentverse provides the agent platform capabilities, while ASI:One and the protocol/tool layer support agent interaction. The app itself will provide the student-facing experience and connect the agent to the project’s resource and integration services.

## Example study session

1. A student opens a subject and selects a relevant note or previous question.
2. They ask Parrot: “Quiz me on Faraday’s law.”
3. Parrot asks a question using the available course context.
4. The student explains the concept in their own words.
5. Parrot identifies what is correct, points out what is missing, and asks a useful follow-up.
6. The student can ask for a concise revision note or another practice question.

This learning loop is inspired by the idea that explaining a concept to someone else helps reveal what you understand and what you need to revisit.

## Scope and responsible use

- Parrot is intended to support learning and exam preparation, not to promise exam results.
- Answers should be grounded in the selected course resources where available, and the experience should make it clear when the material does not support a confident answer.
- Demo content will be identified as demo content.
- Connected services should only be used through supported APIs and with the student’s authorization.
- Integrations such as NotebookLM will be explored only through supported access methods; the project will not imply that an unsupported API is available.

## Hackathon prototype plan

The prototype is focused on demonstrating a complete, understandable agent workflow:

1. Present a FreeResources.in course page with representative demo material.
2. Let a student select or open a resource.
3. Start a topic-specific Parrot quiz.
4. Evaluate the student’s explanation against the available material.
5. Demonstrate the Fetch.ai / ASI agent layer and at least one meaningful tool interaction.

**Fetch-A-Thon 3.0 final results announcement:** 28 October 2026.

## Current status

**Stage: idea and initial prototype setup.** The project is being prepared for the hackathon. Demo data, deployed features, integrations, and final implementation details will be documented here as they become available.

## About Fetch-A-Thon 3.0

Fetch-A-Thon 3.0 is a national-level AI Agent hackathon focused on Agentic AI and practical agent solutions. Its brief invites participants to explore ASI and Agentverse, build with tools and services, and turn a real-world problem into a working prototype.

Parrot AI applies that challenge to a familiar student problem: making exam preparation more focused, interactive, and connected to the material students are actually expected to study.

---

**Parrot AI — Learn. Build. Collaborate. Create.**
