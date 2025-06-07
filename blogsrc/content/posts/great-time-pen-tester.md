Title: It's a Great Time to be a Pen Tester
Date: 2025-06-07
Category: Security
Tags: penetration testing, cybersecurity
Slug: great-time-pen-tester
Author: Jim Gumbley
Summary: Exploring how penetration testing has evolved alongside modern software development practices, and why AI-assisted red teaming might be the future of security validation.
Image: images/960px-Wall_Street_by_Paul_Strand,_1915.jpeg

I've been involved with penetration testing for years, and I've watched it evolve alongside the broader transformation of software development practices. While pen testing remains a valuable security practice, its role and effectiveness have been significantly challenged by the shift toward continuous delivery, cloud-native architectures, and agile development methodologies.

## The Traditional Model and Its Strengths

Traditional penetration testing emerged from and continues to serve important organizational needs. The model provides clear separation of duties through third-party assessment, establishing a genuine third line of defense. External pen testers bring established frameworks like CVSS for vulnerability classification, standardized tooling, and comprehensive written reports with quantifiable metrics.

This approach serves multiple stakeholders effectively. For auditors and compliance teams, it provides the documentation and independent verification required by regulatory frameworks. For executive leadership and non-technical stakeholders, it offers confidence through clear metrics and professionally presented findings. The separation between development teams and security assessors ensures that assumptions and blind spots within internal teams can be identified by fresh perspectives.

However, this very strength reveals a fundamental tension. The emphasis on standardized reporting, compliance alignment, and stakeholder communication often constrains the time and focus available for deep technical investigation. The most significant vulnerabilities frequently emerge not from checklist-driven testing but from extended exploration of edge cases, creative attack paths, and nuanced understanding of how systems behave under unusual conditions.

## The Continuous Delivery Challenge

Modern software development operates through thin slices of functionality, small incremental changes, and rapid deployment cycles. Code moves from development to production daily or even hourly, with infrastructure defined and modified as code alongside application changes. The rise of continuous delivery, cloud infrastructure, and agile methodologies has created a fundamental mismatch with traditional pen testing cadences.

This stands in sharp contrast to the traditional stage-gate process of requirements specification, software development, deployment, penetration testing, sign-off, and release. The old model assumed relatively stable systems that could be assessed at defined points in time, with findings that would remain relevant throughout subsequent operational periods.

Organizations have generally responded by applying pen testing selectively - before initial production releases, for major feature launches, or when significant risk factors like sensitive data handling are introduced. While this maintains some security oversight, it creates an impedance mismatch between development velocity and security validation cycles.

## The Rise of Compensating Controls

By 2025, rather than simply stretching traditional pen testing to cover modern development practices, the security industry has developed several complementary approaches that better align with continuous delivery workflows.

Developer-focused vulnerability scanning tools like [Snyk](https://snyk.io/) provide immediate, actionable security feedback within CI/CD pipelines. Infrastructure security platforms like [Wiz](https://www.wiz.io/) offer continuous assessment of cloud configurations and runtime environments. The shift-left security movement has brought [threat modeling](https://martinfowler.com/articles/agile-threat-modelling.html) directly into development teams, while deeper integration of advanced detection has developed runtime monitoring, anomaly detection, and threat hunting to compare developer activities against established baselines.

## The AI Turning Point of 2025?

We may be at a turning point where automated penetration testing tools finally take the leap in capability we've been eagerly waiting for since at least 2018. The advances in AI reasoning, contextual understanding, and tool use we've seen recently suggest that automated pen testing could soon handle much of the systematic exploration that currently requires human analysts.

AI agents that can understand complex architectures, analyze code repositories, and reason about attack paths might finally deliver on the promise of scalable, intelligent security assessment. Large language models with sophisticated reasoning capabilities could potentially automate the methodical aspects of penetration testing while maintaining context across complex investigation flows.

## The Human Spark That Automated Tools Miss

But here's what I've observed about the best pen testers I know personally: they share something remarkable with the most skilled developers I've worked with. When a talented developer implements an elegant solution to a complex problem, there's a visible spark of delight - that moment when everything clicks into place beautifully. The most effective pen testers exhibit that same quality, but in reverse: they experience genuine glee when they pull the lid off a system and discover something unexpected, when following an intuitive hunch leads to unraveling a significant vulnerability.

This isn't just professional satisfaction - it's the manifestation of deep creative and analytical thinking. These moments of discovery happen when experienced pen testers sense that something feels wrong, even when all automated tools are quiet. They follow threads that logic suggests might be dead ends. They question assumptions about how systems should behave and explore the gaps between intended and actual behavior.

## The Future of Security Discovery

Where do we go from here? What I anticipate is AI-assisted [red teaming](https://csrc.nist.gov/glossary/term/red_team) that could fundamentally change how we validate security controls. Red teaming differs from traditional penetration testing by simulating realistic adversary behavior to test an organization's entire defensive capability - not just finding vulnerabilities, but evaluating how well people, processes, and technology respond to actual attack scenarios.

This longer lifecycle, higher context approach solves the impedance mismatch introduced by high velocity software delivery. For auditors and compliance, this should shift focus from vulnerability counts to defensive effectiveness metrics: detection speed, response quality, and organizational resilience under realistic attack conditions.

Automated, increasingly AI supported, relatively straightforward checks can run at the point of change - integrated directly into CI/CD pipelines to catch obvious vulnerabilities and smells with immediate feedback that matches development velocity. Meanwhile, high-context, high-insight human-driven red team exercises can operate independently of the development cycle. This decoupling allows each approach to operate at its natural cadence and leverage its strengths. The human element remains essential for campaign strategy, creative attack development, and business context interpretation, while AI could handle systematic execution and adaptation.

I don't know for certain what the next steps in security testing will look like, but these extrapolations seem worthy of consideration. Combined with growing threats fueled in part by adversarial adoption of AI, it seems like a great time to be a pen tester! 
