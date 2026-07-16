As the owner of a web studio in Baden-Württemberg, I regularly see the same scenario. A client—a tradesperson, the owner of a small salon, a craft business—forwards me an alarming email. It asks one question: is it true that the website is “breaking the law” because it has no cookie banner? In my practice, such messages are not an order from an authority and not a lawyer’s letter. They are commercial mailings built on legal half-truths and fear of an Abmahnung. Here I break down the genre of these emails itself and answer a simple question: how can a website owner tell the difference between a reputable studio and one that profits from anxiety—and what does German law actually require from a website. One clarification up front: this article explains the general technical and legal framework, but it does not replace individual legal advice for a specific case. I formulate certain legal points cautiously—their applicability always depends on the facts of the specific website.

---

# Fear-Based Marketing on the German Web: How to Read Scare Emails

In my practice, there is a recurring scenario. A client forwards me an email with an anxious question: “Is it true that my website is breaking the law?” The email says the site has no cookie banner, that this is “legally required,” and that without a banner the site is “vulnerable.” It all ends with a gentle offer: if you ever want someone to handle this on an ongoing basis—we’re here.

I want to analyze this genre of message itself, in the form in which I encounter it. This is fear-based marketing built on legal half-truths. The central question is simple: how can a website owner distinguish a reputable studio from one that profits from anxiety—and what German law actually requires from small-business and craft-business websites.

Two clarifications. First: this article explains the technical and general legal framework, but it does not replace individual legal advice for a specific case. Second: this is only about cookies, consent, and scare emails. Impressum, mandatory business disclosures, and a full website audit are separate topics, and I am not addressing them here.

## The Anatomy of a Scare Email

So as not to argue with a paraphrase, here is the actual text of one such email (sender: SENOVATE for style-expert.online):

> Damit du es nochmal vor Augen hast: Kein Cookie-Banner / keine Einwilligung. Das ist bei Websites rechtlich vorgeschrieben - und ohne ist man angreifbar. Bei kleinen Unternehmen wird sowas leider öfter abgemahnt, einfach weil die meisten keine Rechtsabteilung haben, die drauf achtet.
>
> Falls du irgendwann magst, dass sich jemand laufend drum kümmert, sind wir da. Kein Druck, keine weiteren Mails - du weißt jetzt, wo wir sind.

This is one example. But its typical structure is easy to see.

First comes the imitation of care and personal contact: “this is my last email, I don’t want to spam you.” Then comes the claim of legal vulnerability, presented as a universal rule: “no banner means you are breaking the law.” After that, there is an appeal to fear of an Abmahnung, reinforced by the reminder that small businesses do not have a legal department. And at the end, a soft sale of ongoing support with a rhetorical closer: “no pressure, no further emails.”

What this email is not: it is not a notice from a Behörde, not a lawyer’s letter, and not a fine. It is commercial cold outreach. The anxiety is created by the seller of the service, not by the state.

## What the Law in Germany Actually Requires

In Germany, the DSGVO, BDSG, and the sector-specific TDDDG apply. But consent—and accordingly a consent banner—is not required for all technologies, only for non-essential ones: analytics, marketing, retargeting, tracking.

Technically necessary cookies—session, cart, login, language settings—are permissible without a separate banner if there is a proper Datenschutzerklärung.

From this follows the simple practical formula I give clients:

- **If consent-based technologies are in use, you need a banner and honest consent management.**
- **If they are not, a banner for the sake of having a banner is not mandatory, but a privacy section is always required.**

Within this framework, the claim “no banner = breaking the law” is either false or at least misleading. It sounds convincing precisely because it omits the key condition—what data the site is actually processing.

“Tracking” is not just Google Analytics and Meta Pixel. The TDDDG applies to cookies **and similar technologies of access and storage**. In other words, on a typical small-business website, consent may be required for things the owner does not think of as “tracking”:

- embedded YouTube or Vimeo videos
- Google Maps
- reCAPTCHA
- chat widgets and booking tools
- third-party forms and social media pixels
- in the past, externally loaded fonts were also a problem (for example, Google Fonts loaded from Google servers)

So the more accurate question is not “do you have analytics,” but “which external services are actually loaded, and which of them establish access to the device before consent.” The conclusion always depends on the site’s actual configuration, not on the mere presence or absence of a banner as such.

I always keep three points separate so as not to create fresh confusion:

1/ A cookie banner is not always required.  
2/ Consent management is required where consent-based technologies exist.  
3/ A Datenschutzerklärung is required in any case.

“Banner not required” never means “no privacy section is needed at all.”

As for case law, I deliberately keep the conclusion narrow and qualified: the final legal classification should be made by a lawyer on the basis of primary sources. As far as I can judge from the materials available to me, German courts are primarily tightening the standards for the honesty of the design of **existing** banners—the requirement for an equivalent “Alles ablehnen” button, the prohibition of dark patterns. This is not the introduction of a “mandatory banner for every website without exception.” It is about the quality of consent where consent is required, not a universal duty.

## The Sender’s Paradox

Here is the most revealing turn in the genre. I present it strictly as an observation that must be verified as of a given date. As of the date I recorded it, the sender’s website appeared to contain Google Tag Manager (`GTM-535Q5FKJ`) and Meta Pixel (`1625519162058978`)—the very marketing trackers whose absence of consent is held against others. There was also a blocking mechanism before consent (`senovate_cookie_consent`).

I present this cautiously: websites change, and any such claim should be confirmed by a reproducible technical test with a stated date, not by a one-time glance.

But even if confirmed, the contradiction is subtler than “they do the very thing they scare others with.” If the sender has both trackers and a functioning consent mechanism, then they do in fact know how to implement consent technically. The problem is different. Knowing this logic, they create the impression for small businesses that the absence of a banner is illegal in itself—even where there is no analytics and no marketing at all. A false universal generalization is being exploited. This is not a personal attack, but a flaw in the method itself.

## When the Email Itself Is Vulnerable

There is also a reverse side that recipients rarely know about: the scare email itself may be legally vulnerable. I am keeping this section short so as not to replace one scare tactic with another.

Unsolicited promotional email in Germany is restricted by § 7 Abs. 2 Nr. 2 UWG, including in B2B, without the recipient’s prior consent. This is a legally nuanced area: much depends on context and possible legal bases. According to the practice referenced in the materials available to me (BGH, 2009), the risk of an Abmahnung may in principle arise from a single unsolicited promotional email—but this is a possible risk, not an automatic consequence, and the classification should be made by a lawyer based on the specific facts.

Collecting email addresses from third-party websites without a legal basis and without informing the data subject may be problematic under the DSGVO (relevant here are Art. 6 and Art. 13). I am not presenting this as an automatic violation: different legal bases may exist. And if legal threats are deliberately exaggerated in order to create pressure, the wording of the email may fall within the scope of §§ 5, 5a UWG on misleading advertising—this is a possible classification, not an established fact, and it requires an assessment of the specific text.

What a recipient can do if they want to respond calmly, without escalation:

- Declare a Widerspruch and demand deletion of their data (Art. 17, 21 DSGVO).
- If necessary, consider an Abmahnung through a lawyer or the Wettbewerbszentrale.
- File a complaint with the **competent state data protection authority** (determined by the location of the responsible party; for Baden-Württemberg, this is its own state authority, not Bavaria’s BayLDA—the appropriate channel should be checked for the specific case).

The first step is not panic, but checking the facts.

## A Calm Response Instead of Panic

What I give my clients is not emotion, but an inventory. The response scenario looks like this:

1/ **Check the facts.** “We reviewed your website—there are no analytics or marketing cookies, third-party trackers, or embedded services requiring consent / here is what is present.”
2/ **Explain the legal framework without posturing as a lawyer.** “The law requires transparency and consent where data is actually being processed, not a banner for the sake of a banner.”
3/ **Name the motive behind the email.** “This is a commercial mailing using fear of liability, not an order and not a fine.”
4/ **Offer an option just in case.** “If you feel more comfortable with a banner, we can implement a privacy-first solution that blocks any trackers until consent. Technically, this is not currently mandatory.”

If a response to the sender is needed in German, I keep the wording short and non-escalatory:

> Vielen Dank für Ihre Nachricht. Unsere Website wurde geprüft; einwilligungspflichtige Cookies oder Tracker werden nicht ohne Zustimmung geladen, und die Datenschutzerklärung ist vorhanden. Ein weiterer Beratungsbedarf besteht derzeit nicht. Bitte senden Sie keine weitere Werbung an diese Adresse und löschen Sie meine Daten (Art. 17, 21 DSGVO).

Systematically, I do the same thing across all projects: I record cookies, embedded services, and tracking in onboarding and SLAs, document external scripts, explicitly record the decision “banner not needed / CMP implemented,” and conduct regular privacy & compliance reviews with a specialist lawyer.

The marker of professionalism is simple. A reputable studio speaks in the language of conditions: “if X is used, Y is required.” A studio that sells fear speaks in the language of universal threats: “you have no banner, therefore you are breaking the law.”

## A Methodology for Honest Classification

Breaking down one email is not enough. What seems meaningful to me is a live, continuously updated overview of market practices—but only if it is built as a verifiable methodology, not as a list of competitors. That is why I define the criteria in advance and apply them first of all to myself.

**Minimum evidentiary standard.** What enters such a review is not an opinion, but a fact. Every claim must rely on a public source—the text of the mailing, the page source code, a provision of the UWG/DSGVO/TDDDG—with the date of recording and a reproducible test that a third party can repeat.

**Levels of confirmation.** I distinguish three levels: (1) reproducibly confirmed as of the date of review; (2) observed, but requiring repeated verification; (3) the author’s interpretation. Each statement is marked with its level—so that an observation is not passed off as an established fact.

**Right of reply.** The studio is sent an inquiry with a concrete list of facts and a reasonable response deadline. Its position is published alongside the assessment; if no response is received in time, that is explicitly noted without any presumption of guilt.

**Scale of severity.** Practices are ranked rather than thrown together: blatant legal falsehoods, unlawful outreach, dark patterns, and presenting commerce as an “order” are different levels, and they should be assessed separately.

**Correction procedure.** If a studio changes its practice or provides new facts, the entry is updated with the date of revision and a note on what exactly changed. The aim is to create an incentive to correct the issue, not to apply a permanent stigma.

**Symmetry of standards.** I apply the same criteria to myself and to Webgogol: an open self-audit on cookies, embedded services, Datenschutzerklärung, and my own outreach practices. I have no right to demand verifiability from others that I am not prepared to demonstrate myself.

For me, this section matters more than the analysis itself. What the industry needs is not a list of enemies, but a verifiable standard—a point of reference by which business owners, studios, and recommenders (Steuerberater, lawyers, Handwerkskammer advisors) can talk about DSGVO without manipulation.

## Conclusion

An email saying “your website is breaking the law” is not a reason for alarm. It is a reason to ask your provider three concrete questions: which scripts and external services are actually loaded, what is blocked until consent, and where this is documented in the Datenschutzerklärung. The formula remains simple: if consent-based technologies are in use, honest consent is required; if they are not, a banner is not mandatory in itself, but a privacy section is always required.

I deliberately keep the legal conclusions narrow. The applicability of UWG, DSGVO, and TDDDG depends on the site’s actual configuration and the specific circumstances, not on the existence of a banner as such. In a disputed situation, individual legal advice is indispensable, and the legal and case-law statements in this article should be checked against primary sources as of the current date.

The main practical indicator is the language used when speaking to you. A reputable provider formulates conditions (“if X is used, Y is required”), not universal threats. Where the law is concerned, precision matters more than effect. And it is precisely this verifiable, calm approach that protects the owner of a small website more reliably than reacting to someone else’s fear. That is why an honest methodology—one that also applies to the author—is more useful than any isolated quarrel: it raises the bar for the entire industry.

## Check Your Website Without Panic

Answer a few questions about your website and get a cautious initial assessment: whether you likely need a consent banner, what else is worth checking, and how to respond calmly to a scare email. This is not a legal opinion, but a practical inventory following the logic of this article.

**Next step:** Start the diagnostic
