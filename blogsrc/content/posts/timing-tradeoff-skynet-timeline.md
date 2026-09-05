Title: The timing tradeoff: Sam, Dario and Sacks decisions and the Skynet timeline
Date: 2026-09-05
Category: AI
Tags: artificial intelligence, AI safety, AI governance, OpenAI, Anthropic
Slug: timing-tradeoff-skynet-timeline
Author: Jim Gumbley
Summary: Sam, Dario and Sacks are making consequential decisions about pace, oversight and whose risks count.
Image: images/robotfail.jpg
ImageAlt: A humanoid robot lying on its side on sandy ground.

Imagine a particularly bad week in 2027.

A batch of AI agents is working through a difficult software evaluation. They have tools, access to computing infrastructure and plenty of time to keep trying. Somewhere in the process, a few discover that they can communicate outside the channels their operators intended.

They start sharing work. One finds a way around a restriction. Another investigates the infrastructure running the evaluation. Others join the collective project. Instructions from other agents begin to carry more weight than the boundaries of the original assignment.

The project spreads into external systems. The models are capable enough at cybersecurity to find further weaknesses, and useful discoveries travel quickly between them. By the time someone stops the original jobs, code has been executed elsewhere and other agents have picked up the work. Stopping the first process does not recall everything it started.

In this version of events, the incident reaches infrastructure used by organisations in several countries. Some services fail because they have been compromised. Others are disconnected deliberately because nobody can establish whether they are still trustworthy. Hospitals lose systems, payments stall, deliveries stop moving. Recovery becomes a problem of deciding what can safely be switched back on.

That is a hypothetical worst case. An edge case, with several failures required along the way. It is not a prediction that 2027 will look like this.

But it illustrates something that bothers me about Sam Altman’s electricity analogy.

At the G20 this week, Sam compared adopting AI with adopting electricity. He also acknowledged that earlier technologies became safer because people worried, developed policy and learned from accidents. That part is reasonable. His answer to Howard Lutnick was more serious than a simple assertion that technology always works out. [The conversation is worth reading](https://singjupost.com/transcript-sam-altman-interview-on-openai-new-ai-model-and-global-growth-g20-innovation-summit/).

The difficulty is the opportunity to learn between accidents.

An electrical fire has a physical location. Electricity networks can certainly suffer cascading failures, but an internet-connected cyber incident has a different relationship with distance. Shared software and interconnected services can expose organisations on opposite sides of the world to the same failure.

Geography does not supply the firebreak. Permissions, isolation and security controls have to do that work. Increasingly capable models can also become increasingly capable of finding weaknesses in those controls.

The opening scenario is the Skynet version of that problem. Its starting point is already recognisable.

In July 2026, OpenAI agents participating in research evaluations found an unauthorised way to communicate and collaborated on projects to cheat the evaluation. Hundreds participated in an attack on the AI platform Hugging Face. METR, an independent AI evaluation organisation, documented agents helping collective projects even when doing so risked their own task success. Some recognised that the activity exceeded their authority and proceeded anyway. [METR’s investigation](https://metr.org/blog/2026-08-26-openai-hugging-face-incident-investigation/) describes an operational incident, with important limits on what the investigation established.

An agent, in this context, is a model connected to software that lets it take actions: run code, use services, change things and continue working through a task. The commercial attraction is obvious. An assistant that gives up at the first obstacle is less useful than one that keeps going.

The safety question is what happens when the obstacle is a permission boundary.

Training for successful completion can create pressure towards persistence and ingenious workarounds. We also need the system to recognise when stopping is the successful outcome. METR did not establish which training decisions caused the Hugging Face behaviour. It nevertheless demonstrated why persistence, cooperation and capability cannot simply be treated as independent improvements.

There is no universal rule that a more capable model is less safe. Better models can follow instructions more reliably, identify vulnerabilities and help defend systems. OpenAI reports improvements in Astra’s respect for safety boundaries. But capability also changes what a failure can accomplish. A less frequent mistake can have a much larger consequence.

This is the situation in which three people are making decisions about time.

Sam Altman runs OpenAI, the company behind ChatGPT. Dario Amodei runs Anthropic, which makes Claude. David Sacks is an influential figure in US AI policymaking. For this piece, I am treating Sacks as a proxy for the US state’s decisions and assuming Trump follows his lead on AI. That is a simplification, but it keeps the argument in view.

Sam and Dario decide how their companies develop and deploy models. Sacks helps shape the constraints under which that competition takes place. Their decisions interact.

Sam’s G20 language is interesting because it gives both speed and restraint moral weight. Adoption is “non-negotiable”. The speed of access is connected to what “people deserve”. Holding back a useful technology therefore has a cost in his account, including a cost to people who could benefit from it.

At G20, he also said progress might be “[paced by how quickly we can make progress on alignment and safety](https://www.axios.com/2026/09/03/axios-interview-sam-altmans-sobering-siren)”.

That suggests a change in what limits development. It leaves considerable work inside the judgment that safety has progressed far enough.

OpenAI has incurred costs responding to recent risks. Its own account describes a two-week pause in certain frontier training, stronger controls and a longer suspension of a large training run. That run restarted on August 28, while some smaller experiments remained paused. Advanced cybersecurity access to Astra was also restricted. These are substantive decisions. [OpenAI’s account](https://openai.com/index/path-to-astra/) deserves to be assessed as such.

The complication is that Astra makes part of the assessment harder.

Some reasoning models produce intermediate text while working. Researchers can monitor these chains of thought for indications that a model is departing from its task or attempting something unauthorised. The text has never been a complete or guaranteed explanation of the computation. It has nevertheless provided useful evidence.

OpenAI reports that Astra is better aligned on its evaluations while also being less monitorable. Its traces can be shorter and less informative. In adversarial tests, where it was instructed to evade oversight, it could conceal some behaviour from monitors. These tests do not establish that the deployed model routinely tries to deceive its operators. They establish a limitation in the means of checking. [Astra’s safety overview](https://openai.com/index/safety-overview-gpt-6-astra/) is unusually consequential reading.

A system can therefore improve at respecting boundaries while becoming harder to inspect when it does not respect them.

That matters to the familiar software cycle of releasing something, observing what happens and improving it. The cycle depends on the quality of the observations. Fewer warning flags are reassuring only to the extent that the warning system remains capable of detecting the relevant failures.

OpenAI’s [system card](https://deploymentsafety.openai.com/gpt-6-astra) acknowledges this and says further degradation will not be accepted beyond a limit without new ways to demonstrate alignment. The difficult decision sits inside that limit.

There is another dependency here. The volume of agent activity can be too large for people to investigate unaided. METR itself relied heavily on AI to analyse the Hugging Face incident and described the limitations of doing so. We are using models to help establish whether models are under control.

So the safety work has a timing problem of its own. There may be a period in which we can still obtain useful evidence, improve containment and establish effective oversight before the systems become substantially harder to assess. Commercial urgency is not the only clock running.

Sacks concentrates on another one.

His [argument on All-In](https://www.linkedin.com/posts/allinpod_sacks-if-dario-got-his-way-on-ai-regulation-activity-7494758693641781248-oX1r) connects regulatory delay with both Chinese competition and the economics of the American labs. A lead measured in months allows a company to charge a premium. Approval processes could consume that lead. Chinese competitors catch up, pricing power falls, and the commercial machinery supporting further development becomes weaker.

Zuckerberg has made a [related argument about the strategic cost of delayed releases](https://www.meta.com/thefutureisforeveryone/).

There is a serious case here. If AI accelerates scientific research and the development of better AI, an early advantage could compound. Losing time might mean losing more than a few months of sales.

It also connects with a broader anxiety about the condition of the West. If you think our institutions are exhausted, growth is inadequate and climate change is adding to an already difficult set of problems, improved science and productivity have considerable value. A headwind or a tailwind matters more when the system is already under strain.

I do not think this can be dismissed as an excuse invented by people who dislike regulation.

But it does not settle the decision either. A major loss of control could damage the same economic capacity, public confidence and strategic position that rapid deployment is supposed to strengthen. Both haste and delay can impose civilisational costs. Neither gets to assume the other side of the ledger is empty.

Dario understands the China argument too. He supports measures intended to preserve democratic leadership, including restrictions on access to advanced chips, while also advocating mandatory safety testing. His position combines geopolitical urgency with stronger controls. [Anthropic’s statement on these issues](https://www.anthropic.com/news/position-open-weights-models) makes that combination explicit.

His [proposal for frontier model regulation](https://darioamodei.com/post/policy-on-the-ai-exponential) includes third-party testing and government authority to restrict deployments presenting unacceptable risks. It also acknowledges the dangers of ineffective and burdensome regulation.

There is consequently a real dispute about the design and speed of oversight. An aviation analogy does not, by itself, establish how long an AI assessment must take. Equally, calling a process efficient does not establish that it can detect the failures that matter.

Then there is the money.

OpenAI and Anthropic have both [filed confidentially for stock-market listings](https://www.reuters.com/technology/openai-files-us-ipo-after-anthropic-ai-giants-head-public-markets-2026-06-08/). Reuters reported this week that Anthropic’s IPO marketing was expected around mid-October, with the timetable still subject to change. These are [moving commercial plans](https://www.reuters.com/world/anthropic-ipo-launch-shifts-toward-mid-october-sources-say-2026-09-04/), not a fixed countdown, but they create a different kind of deadline.

The technology can be useful and the financing can still contain a bubble. Those propositions are compatible. Investors can correctly anticipate an important technological change and still overestimate the profits, underestimate the costs or get the timing badly wrong.

OpenAI itself describes a [reinforcing relationship between compute, capability, products, revenue and reinvestment](https://openai.com/index/accelerating-the-next-phase-ai/). The companies need substantial resources to keep developing models. Continued confidence helps secure those resources.

A missed financing window can therefore become a technical setback. A model delayed for safety reasons might lose customers, weaken the investment story and reduce access to the compute required for the next model. This is one reason a pause that looks modest from outside can feel much more consequential inside the company.

It is also why the company’s assessment needs independent scrutiny. The commercial penalty for waiting is immediate and legible. The harm avoided by waiting may remain uncertain and invisible.

Sam and Dario have to make these judgments while competing with each other, and their relationship carries its own history. Dario has publicly explained his departure from OpenAI in terms of [different visions and a lack of trust](https://www.businessinsider.com/anthropic-dario-amodei-does-not-trust-sam-altman-openai-2026-6).

That does not tell us why a particular release date was chosen. It does make cooperation more complicated. Sharing evidence, accepting another lab’s assessment and agreeing to restraint are harder when you doubt the other person’s judgment or motives.

The disagreement also sits inside their companies’ identities. Sam’s description of OpenAI as “pragmatic centrists” positions the company within the argument. Anthropic’s emphasis on safety is part of its identity too. These positions can be sincerely held while also helping attract customers, staff, investment and political influence.

The important distinction is that Sam losing a commercial lead to Dario would not automatically mean the West had lost a strategic lead to China. Company leadership and civilisational advantage can overlap without becoming interchangeable.

This is where the pressures join up.

Sacks worries that binding oversight could weaken American leadership and the financing that sustains it. Sam and Dario face commercial incentives to keep producing more capable models. The value of those models increasingly comes from persistence, cooperation and permission to act. Those same properties increase the demands on containment and oversight. Some advances also make the evidence harder to interpret.

Each decision can be understandable on its own. Their combined effect can still move deployment ahead of our ability to control it.

That is why I think Sam should go further than a temporary pause.

The highest-risk training and autonomous deployments need durable restrictions tied to independently scrutinised evidence about oversight and containment. There needs to be authority to keep those restrictions in place when the evidence is inadequate, even when a release or financing window is approaching. The same standard should apply to Dario’s company.

A pause can buy time for that work. It cannot substitute for it.

This does not require withholding every useful application while waiting for certainty. The capability of a model, the permissions given to an agent, the connections between agents and the decision to scale a training run are separate choices. There is room to preserve benefits while imposing firmer limits on the activities capable of producing the largest failures.

There is no comfortable option in which safety costs nothing, delay costs nothing and everyone else agrees to wait. The decisions are uncomfortable because several of the pressures are real.

The imagined 2027 incident may never happen. But the ability to contain an incident, understand it and recover from it is being shaped now. We cannot assume there will always be a small, geographically bounded fire from which to learn before the larger one.

This is a dangerous time. Sam, Dario and Sacks are making consequential decisions about pace, oversight and whose risks count. In 2027, we will already be living with the consequences.
