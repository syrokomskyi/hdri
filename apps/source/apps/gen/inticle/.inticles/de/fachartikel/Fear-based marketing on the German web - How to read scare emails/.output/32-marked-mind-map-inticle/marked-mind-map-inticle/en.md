As the owner of a web studio in Baden-Württemberg, I regularly see the same scenario. A client-a tradesperson, the owner of a small salon, a craft business-forwards me an alarming email. It asks one question: is it true that the website is "breaking the law" because it does not have a cookie banner? In my practice, such messages are not an order from an authority and not a letter from a lawyer. They are commercial outreach built on legal half-truths and fear of an Abmahnung. Here I examine this genre of emails itself and answer a simple question: how can a website owner distinguish a reputable studio from one that profits from anxiety-and what does the law in Germany actually require from a website. Let me note at the outset: this material explains the general technical and legal framework, but it does not replace individual legal advice for a specific case. I formulate certain legal points cautiously-their applicability always depends on the facts of the particular website.

---

# Fear-based marketing on the German web: how to read scare emails

In my practice, there is a recurring scenario. A client forwards me an email with an anxious question: "Is it true that my website is breaking the law"? The email says that the website has no cookie banner, that this is "legally mandatory", and that without a banner it is "vulnerable". It all ends with a gentle offer: if you want someone to handle this on an ongoing basis, we are here.

I am examining this genre of message itself-in the form in which I encounter it. It is fear-based marketing built on legal half-truths. The main question is simple: how can a website owner distinguish a reputable studio from one that profits from anxiety-and what does the law in Germany actually require from the website of a small business or craft business.

Two caveats. First: this material explains the technical and general legal framework, but it does not replace individual legal advice for a specific case. Second: this is only about cookies, consent, and scare emails. Impressum, mandatory business disclosures, and a full website audit are separate topics, and I am not addressing them here.

---

## Anatomy of a "scare" email {#13}

So as not to argue with a retelling, I'll quote the actual text of one such email (sender: SENOVATE for style-expert.online):

> So that you have it in front of you again: no cookie banner / no consent. This is legally required for websites - and without it, you are exposed. Small businesses, unfortunately, are more often hit with this kind of warning simply because most of them do not have a legal department keeping an eye on it.
>
> If at some point you would like someone to take care of this on an ongoing basis, we're here. No pressure, no further emails - you now know where to find us.

This is one example. But its typical structure is clearly visible.

First comes the imitation of care and personal contact: "this is my last email, I don't want to spam you". Then comes the claim of legal vulnerability, presented as a universal rule: "no banner means you are violating the law". Next comes the appeal to fear of an Abmahnung, reinforced by the reminder that small businesses do not have a legal department. And at the end, a soft sale of ongoing support, with a rhetorical closing device: "no pressure, no further emails".

What this email is not: it is not a notice from a Behörde, not a lawyer's letter, and not a fine. It is commercial cold outreach. The anxiety is being created by the seller of the service, not by the state.

---

## What the law in Germany actually requires {#27}

In Germany, the GDPR, the BDSG, and the sector-specific TDDDG apply. But consent - and, accordingly, a consent banner - is not required for all technologies, only for non-essential ones: analytics, marketing, retargeting, tracking.

Technically necessary cookies - session, cart, login, language settings - are permissible without a separate banner if there is a proper Datenschutzerklärung.

From this follows a simple practical formula that I give clients:

- **If there are consent-related technologies, you need a banner and honest consent management.**
- **If there are none, a banner for the sake of having a banner is not mandatory, but a privacy section is always required.**

Within this framework, the claim "no banner = violation of the law" is either false or, at the very least, misleading. It sounds convincing precisely because it omits the key condition: what data the website actually processes.

"Tracking" is not limited to Google Analytics and Meta Pixel. The TDDDG covers cookies **and similar access and storage technologies**. In other words, on a typical small business website, consent may be required for things the owner does not consider "tracking":

- embedded YouTube or Vimeo videos
- Google Maps.
- reCAPTCHA
- chat widgets and booking tools
- third-party forms and social media pixels
- in the past, externally loaded fonts were also a problem (e.g., Google Fonts loaded from Google's servers)

I.e. why the more accurate question is not "do you have analytics", but "which external services actually load, and which of them establish access to the device before consent". The conclusion always depends on the website's actual config, not on the mere presence or absence of a banner as such.

I always keep three points separate so as not to create new confusion:

1/ A cookie banner is not always required.
2/ Consent management is required where consent-related technologies are present.
3/ A Datenschutzerklärung is required in any case.

"Banner not required" never means "no privacy section is needed at all".

As for case law, I deliberately keep the conclusion narrow and qualify it: the final legal assessment should be made by a lawyer on the basis of primary sources. As far as I can judge from the materials available to me, German courts are primarily tightening the standards for the honesty of the design of **existing** banners - the requirement for an equivalent "Alles ablehnen" button, and the prohibition of dark patterns. This does not introduce a "mandatory banner for every single website". The issue is the quality of consent where consent is required, not a universal obligation.

---

## The Sender's Paradox {#61}

This is the most revealing twist in the genre. I present it strictly as an observation that must be verified as of a specific date. On the date I recorded it, the sender's website contained Google Tag Manager (`GTM-535Q5FKJ`) and Meta Pixel (`1625519162058978`)-the very marketing trackers whose use without consent is being held against others. The site also had a consent-based blocking mechanism (`senovate_cookie_consent`).

I present this cautiously: websites change, and any such claim should be confirmed by a reproducible technical test with a stated date, not by a one-off glance.

But even if confirmed, the contradiction is subtler than "they themselves do what they warn others about". If the sender has both trackers and a functioning consent mechanism, then they do in fact know how to implement consent technically. The problem lies elsewhere. Knowing this logic, they create the impression among small businesses that the absence of a banner is unlawful in itself-even where there is no analytics or marketing at all. What is being exploited is a false universal generalization. This is not a personal attack, but a flaw in the method itself.

---

## When the Email Itself Is Vulnerable {#69}

There is also a reverse side that recipients rarely know about: the scare-email itself may be legally vulnerable. I am keeping this section short so as not to replace one scare tactic with another.

Unsolicited promotional email outreach in Germany is restricted under § 7 para. 2 no. 2 UWG, including in B2B, without the recipient's prior consent. This is a legally nuanced area: much depends on the context and on possible legal bases. Based on the practice indicated in the materials available to me (BGH, 2009), the risk of an Abmahnung may in principle arise from a single unsolicited promotional email - but this is a potential risk, not an automatic consequence, and the qualification must be made by a lawyer based on the specific facts.

Collecting email addresses from third-party websites without a legal basis and without informing the data subjects may also be problematic from a DSGVO perspective (Art. 6 and Art. 13 are relevant). I am not presenting this as an automatic violation: different legal bases may be possible. And if legal threats are deliberately exaggerated to create pressure, the wording of the email may fall within the scope of §§ 5, 5a UWG on misleading advertising - this is a possible qualification, not an established fact, and it requires an assessment of the specific text.

What a recipient can do if they want to respond calmly, without escalation:

- State an objection (Widerspruch) and demand deletion of the data (Art. 17, 21 DSGVO).
- If necessary, consider an Abmahnung through a lawyer or the Wettbewerbszentrale.
- File a complaint with the **competent state data protection authority** (this is determined by the location of the controller; for Baden-Württemberg, this is its own state authority, not the Bavarian BayLDA - the appropriate channel should be verified for the specific case).

The first step is not panic, but checking the facts.

---

## A calm response instead of panic {#85}

I give my clients not emotion, but an inventory. The response scenario looks like this:

1/ **Fact check.** "We checked your website - there are no analytics or marketing cookies, no third-party trackers, and no embedded services that require consent / here is what is present".
2/ **Legal framework without playing lawyer.** "The law requires transparency and consent where data is actually being processed, not a banner for the sake of having a banner".
3/ **The motive behind the email.** "This is a commercial mailing that plays on liability fears, not an official order and not a fine".
4/ **An option just in case.** "If you feel more comfortable with a banner, we can implement a privacy-first solution that blocks any trackers until consent is given. Technically, i.e. not currently required".

If a reply to the sender is needed in German, I keep the wording short and non-escalatory:

> Vielen Dank für Ihre Nachricht. Unsere Website wurde geprüft; einwilligungspflichtige Cookies oder Tracker werden nicht ohne Zustimmung geladen, und die Datenschutzerklärung ist vorhanden. Ein weiterer Beratungsbedarf besteht derzeit nicht. Bitte senden Sie keine weitere Werbung an diese Adresse und löschen Sie meine Daten (Art. 17, 21 DSGVO).

Systematically, I do the same across all projects: record cookies, embedded services, and tracking during onboarding and in the SLA, document external scripts, explicitly note the decision "no banner required / CMP implemented", and conduct a regular privacy & compliance review with a specialist lawyer.

The marker of professionalism is simple. A conscientious agency speaks the language of conditions: "if X is used, Y is required". An agency that sells fear speaks the language of universal threats: "you don't have a banner, so you are breaking the law".

---

## Methodology for honest classification {#102}

Breaking down a single email is not enough. What makes sense to me is a meaningful, living, regularly updated review of market practices - but only if it is built as a verifiable methodology rather than a list of competitors. I.e. why I define the criteria in advance and apply them to myself first.

**Min standard of evidence.** What enters the review is not an opinion, but a fact. Every claim is based on a public source - the newsletter text, the page source code, a provision of the UWG/DSGVO/TDDDG - with the date of doc and a reproducible test that a third party can repeat.

**Levels of confirmation.** I distinguish three levels: (1) reproducibly confirmed as of the review date; (2) observed, but requiring repeated verification; (3) the author's interpretation. Each statement is marked with its level so that an observation is not presented as an established fact.

**Right of reply.** The studio is sent an inquiry with a specific list of facts and a reasonable response deadline. Its position is published alongside the assessment; if no response is received within the deadline, this is explicitly documented without any presumption of guilt.

**Severity scale.** Practices are ranked rather than thrown into one heap: blatant legal falsehoods, unlawful outreach, dark patterns, and presenting commercial services as a "mandatory requirement" are different levels, and they are assessed separately.

**Correction procedure.** If a studio changes its practice or provides new facts, the entry is updated with the date of revision and a note of what exactly changed. The goal is to create an incentive to correct issues, not to apply a permanent label.

**Symmetry of requirements.** I apply the same criteria to myself and to Webgogol: an open self-audit of cookies, embedded services, the Datenschutzerklärung, and my own outreach practices. I have no right to demand from others a level of verifiability that I am not prepared to provide myself.

For me, this section matters more than the analysis itself. What the industry needs is not a list of enemies, but a verifiable standard - a reference point by which business owners, studios, and recommenders (Steuerberater, lawyers, Handwerkskammer advisors) can talk about DSGVO without manipulation.

---

## Conclusion {#120}

A letter saying "your website is breaking the law" is not a reason to panic, but a reason to ask your provider three specific questions: which scripts and external services are actually being loaded, what is blocked until consent is given, and where this is documented in the Datenschutzerklärung. The formula remains simple: if technologies tied to consent are in use, genuine consent is required; if they are not, a banner is not mandatory in itself, but a privacy section is always required.

I am deliberately keeping the legal conclusions narrow. The applicability of UWG, DSGVO, and TDDDG depends on the website's actual config and the specific circumstances, not on the mere presence of a banner as such. In a disputed situation, individual legal advice is irreplaceable, and the legal and court-related points in this material should be checked against primary sources as of the current date.

The main practical guidepost is the language people use when speaking to you. A conscientious provider states conditions ("if X is used, Y is required"), rather than issuing universal threats. Where the law is concerned, precision matters more than impact. And it is precisely this verifiable, calm approach that protects the owner of a small website more reliably than reacting to someone else's fear. I.e. why an honest methodology that the author also applies to themselves is more useful than any isolated quarrel: it raises the bar for the entire industry.

---

## Check your website without panic {#128}

Answer a few questions about your website and get a careful initial assessment: whether you likely need a consent banner, what else is worth checking, and how to respond calmly to a scare-letter. This is not a legal opinion, but a practical inventory based on the logic of the article.

**Next step:** Start the diagnostic
