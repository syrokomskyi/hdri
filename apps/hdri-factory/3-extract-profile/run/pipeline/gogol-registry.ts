/*
<MODULE_CONTRACT>
<purpose>Maps gogol declaration factory names to concrete gogol class constructors and provides a factory function for instantiation.</purpose>
<keywords>gogol registry, factory, step creation, pipeline</keywords>
<responsibilities>
  <item>Define a registry of gogol factory ids to their corresponding Gogol class instances.</item>
  <item>Provide createGogolById to load declaration metadata and instantiate the correct gogol with guide explanation.</item>
</responsibilities>
<non-goals>
  <item>Not responsible for phase creation, member ordering, or pipeline assembly.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="createGogolById">Loads a gogol declaration by id, looks up its factory, and returns an instantiated pipeline step with guide explanation.</entry>
  <entry key="simpleFactories">Static lookup table mapping factory names to Gogol class constructor functions.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
import { SetupProfileDbGogol } from '../gogols/SetupProfileDbGogol.js';
import { CrawlGogol } from '../gogols/CrawlGogol.js';
import { FetchDetectedPagesGogol } from '../gogols/FetchDetectedPagesGogol.js';
import { ExtractImpressumGogol } from '../gogols/ExtractImpressumGogol.js';
import { ExtractDatenschutzGogol } from '../gogols/ExtractDatenschutzGogol.js';
import { ExtractOpeningHoursGogol } from '../gogols/ExtractOpeningHoursGogol.js';
import { ExtractCookieBannerGogol } from '../gogols/ExtractCookieBannerGogol.js';
import { ExtractCopyrightYearGogol } from '../gogols/ExtractCopyrightYearGogol.js';
import { ExtractPhoneGogol } from '../gogols/ExtractPhoneGogol.js';
import { ExtractEmailGogol } from '../gogols/ExtractEmailGogol.js';
import { ExtractSchemaLocalBusinessGogol } from '../gogols/ExtractSchemaLocalBusinessGogol.js';
import { ExtractSchemaServiceGogol } from '../gogols/ExtractSchemaServiceGogol.js';
import { ExtractSchemaFaqGogol } from '../gogols/ExtractSchemaFaqGogol.js';
import { ExtractSchemaHowToGogol } from '../gogols/ExtractSchemaHowToGogol.js';
import { ExtractSchemaBreadcrumbGogol } from '../gogols/ExtractSchemaBreadcrumbGogol.js';
import { ExtractSchemaOpeningHoursSpecGogol } from '../gogols/ExtractSchemaOpeningHoursSpecGogol.js';
import { ExtractSchemaPersonGogol } from '../gogols/ExtractSchemaPersonGogol.js';
import { ExtractSchemaReviewGogol } from '../gogols/ExtractSchemaReviewGogol.js';
import { ExtractSchemaProductGogol } from '../gogols/ExtractSchemaProductGogol.js';
import { ExtractBfsgPageGogol } from '../gogols/ExtractBfsgPageGogol.js';
import { ExtractAgbPageGogol } from '../gogols/ExtractAgbPageGogol.js';
import { ExtractWiderrufPageGogol } from '../gogols/ExtractWiderrufPageGogol.js';
import { ExtractVersandPageGogol } from '../gogols/ExtractVersandPageGogol.js';
import { ExtractContactFormGogol } from '../gogols/ExtractContactFormGogol.js';
import { ExtractPortfolioGogol } from '../gogols/ExtractPortfolioGogol.js';
import { ExtractMapGogol } from '../gogols/ExtractMapGogol.js';
import { ExtractTeamPageGogol } from '../gogols/ExtractTeamPageGogol.js';
import { ExtractTestimonialsGogol } from '../gogols/ExtractTestimonialsGogol.js';
import { ExtractCertificationsGogol } from '../gogols/ExtractCertificationsGogol.js';
import { ExtractAwardsGogol } from '../gogols/ExtractAwardsGogol.js';
import { ExtractMembershipsGogol } from '../gogols/ExtractMembershipsGogol.js';
import { ExtractMeisterGogol } from '../gogols/ExtractMeisterGogol.js';
import { ExtractCaseStudiesGogol } from '../gogols/ExtractCaseStudiesGogol.js';
import { ExtractLinkHandelsregisterGogol } from '../gogols/ExtractLinkHandelsregisterGogol.js';
import { ExtractLinkUnternehmensregisterGogol } from '../gogols/ExtractLinkUnternehmensregisterGogol.js';
import { ExtractLinkKammernGogol } from '../gogols/ExtractLinkKammernGogol.js';
import { ExtractLinkIndustryCatalogsGogol } from '../gogols/ExtractLinkIndustryCatalogsGogol.js';
import { ExtractLinkGoogleBusinessGogol } from '../gogols/ExtractLinkGoogleBusinessGogol.js';
import { ExtractSocialFacebookGogol } from '../gogols/ExtractSocialFacebookGogol.js';
import { ExtractSocialInstagramGogol } from '../gogols/ExtractSocialInstagramGogol.js';
import { ExtractSocialYoutubeGogol } from '../gogols/ExtractSocialYoutubeGogol.js';
import { ExtractSocialXingGogol } from '../gogols/ExtractSocialXingGogol.js';
import { ExtractSocialLinkedinGogol } from '../gogols/ExtractSocialLinkedinGogol.js';
import { ExtractSocialTiktokGogol } from '../gogols/ExtractSocialTiktokGogol.js';
import { ExtractSocialWhatsappGogol } from '../gogols/ExtractSocialWhatsappGogol.js';
import { ExtractSocialPinterestGogol } from '../gogols/ExtractSocialPinterestGogol.js';
import { ExtractSocialTwitterGogol } from '../gogols/ExtractSocialTwitterGogol.js';
import { SummarizeProfileGogol } from '../gogols/SummarizeProfileGogol.js';
import { VerifyUpstreamGogol } from '../gogols/VerifyUpstreamGogol.js';
import { SignSourceGogol } from '../gogols/SignSourceGogol.js';
import { loadGogolDeclaration, toGogolGuideSeed } from './declaration.js';
import type { SiteProfilePipelineStep, PipelineBuildContext } from './build-types.js';

const simpleFactories: Record<string, () => SiteProfilePipelineStep> = {
  'setup-profile-db':                  () => new SetupProfileDbGogol(),
  'crawl-pages':                       () => new CrawlGogol(),
  'fetch-detected-pages':              () => new FetchDetectedPagesGogol(),
  // existing extract gogols
  'extract-impressum':                 () => new ExtractImpressumGogol(),
  'extract-datenschutz':               () => new ExtractDatenschutzGogol(),
  'extract-opening-hours':             () => new ExtractOpeningHoursGogol(),
  'extract-cookie-banner':             () => new ExtractCookieBannerGogol(),
  'extract-copyright-year':            () => new ExtractCopyrightYearGogol(),
  'extract-phone':                     () => new ExtractPhoneGogol(),
  'extract-email':                     () => new ExtractEmailGogol(),
  // Schema.org
  'extract-schema-local-business':     () => new ExtractSchemaLocalBusinessGogol(),
  'extract-schema-service':            () => new ExtractSchemaServiceGogol(),
  'extract-schema-faq':                () => new ExtractSchemaFaqGogol(),
  'extract-schema-how-to':             () => new ExtractSchemaHowToGogol(),
  'extract-schema-breadcrumb':         () => new ExtractSchemaBreadcrumbGogol(),
  'extract-schema-opening-hours-spec': () => new ExtractSchemaOpeningHoursSpecGogol(),
  'extract-schema-person':             () => new ExtractSchemaPersonGogol(),
  'extract-schema-review':             () => new ExtractSchemaReviewGogol(),
  'extract-schema-product':            () => new ExtractSchemaProductGogol(),
  // Legal pages
  'extract-bfsg-page':                 () => new ExtractBfsgPageGogol(),
  'extract-agb-page':                  () => new ExtractAgbPageGogol(),
  'extract-widerruf-page':             () => new ExtractWiderrufPageGogol(),
  'extract-versand-page':              () => new ExtractVersandPageGogol(),
  // Content signals
  'extract-contact-form':              () => new ExtractContactFormGogol(),
  'extract-portfolio':                 () => new ExtractPortfolioGogol(),
  'extract-map':                       () => new ExtractMapGogol(),
  'extract-team-page':                 () => new ExtractTeamPageGogol(),
  'extract-testimonials':              () => new ExtractTestimonialsGogol(),
  'extract-certifications':            () => new ExtractCertificationsGogol(),
  'extract-awards':                    () => new ExtractAwardsGogol(),
  'extract-memberships':               () => new ExtractMembershipsGogol(),
  'extract-meister':                   () => new ExtractMeisterGogol(),
  'extract-case-studies':              () => new ExtractCaseStudiesGogol(),
  // External links
  'extract-link-handelsregister':      () => new ExtractLinkHandelsregisterGogol(),
  'extract-link-unternehmensregister': () => new ExtractLinkUnternehmensregisterGogol(),
  'extract-link-kammern':              () => new ExtractLinkKammernGogol(),
  'extract-link-industry-catalogs':    () => new ExtractLinkIndustryCatalogsGogol(),
  'extract-link-google-business':      () => new ExtractLinkGoogleBusinessGogol(),
  // Social platforms
  'extract-social-facebook':           () => new ExtractSocialFacebookGogol(),
  'extract-social-instagram':          () => new ExtractSocialInstagramGogol(),
  'extract-social-youtube':            () => new ExtractSocialYoutubeGogol(),
  'extract-social-xing':               () => new ExtractSocialXingGogol(),
  'extract-social-linkedin':           () => new ExtractSocialLinkedinGogol(),
  'extract-social-tiktok':             () => new ExtractSocialTiktokGogol(),
  'extract-social-whatsapp':           () => new ExtractSocialWhatsappGogol(),
  'extract-social-pinterest':          () => new ExtractSocialPinterestGogol(),
  'extract-social-twitter':            () => new ExtractSocialTwitterGogol(),
  // Summarize
  'summarize-profile':                 () => new SummarizeProfileGogol(),
  'verify-upstream':                   () => new VerifyUpstreamGogol(),
  'sign-source':                       () => new SignSourceGogol(),
};

export const createGogolById = (
  id: string,
  context: PipelineBuildContext,
): SiteProfilePipelineStep => {
  const declaration = loadGogolDeclaration({ id, language: context.declarationLanguage });
  const factory = simpleFactories[declaration.factory];
  if (!factory) throw new Error(`Unknown gogol factory: ${declaration.factory} (id: ${id})`);
  return factory().withExplanation(toGogolGuideSeed(declaration));
};

