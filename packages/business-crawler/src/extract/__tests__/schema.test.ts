import { describe, it, expect } from 'vitest';
import {
  extractSchemaLocalBusiness,
  extractSchemaService,
  extractSchemaFaq,
  extractSchemaHowTo,
  extractSchemaBreadcrumb,
  extractSchemaOpeningHoursSpec,
  extractSchemaPerson,
  extractSchemaReview,
  extractSchemaProduct,
} from '../schema.js';

const withSchema = (type: string | object) => {
  const obj = typeof type === 'string' ? { '@context': 'https://schema.org', '@type': type } : type;
  return `<html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head><body></body></html>`;
};

const noSchema = `<html><body><p>Keine strukturierten Daten.</p></body></html>`;

describe('extractSchemaLocalBusiness', () => {
  it('detects LocalBusiness type', () => {
    expect(extractSchemaLocalBusiness(withSchema('LocalBusiness')).present).toBe(true);
  });

  it('detects subtype "Restaurant"', () => {
    expect(extractSchemaLocalBusiness(withSchema('Restaurant')).present).toBe(true);
  });

  it('detects subtype "Store"', () => {
    expect(extractSchemaLocalBusiness(withSchema('Store')).present).toBe(true);
  });

  it('returns false when no matching type', () => {
    expect(extractSchemaLocalBusiness(noSchema).present).toBe(false);
  });

  it('returns false for unrelated type "Article"', () => {
    expect(extractSchemaLocalBusiness(withSchema('Article')).present).toBe(false);
  });
});

describe('extractSchemaFaq', () => {
  it('detects FAQPage type', () => {
    expect(extractSchemaFaq(withSchema('FAQPage')).present).toBe(true);
  });

  it('returns false when no FAQPage', () => {
    expect(extractSchemaFaq(noSchema).present).toBe(false);
  });
});

describe('extractSchemaHowTo', () => {
  it('detects HowTo type', () => {
    expect(extractSchemaHowTo(withSchema('HowTo')).present).toBe(true);
  });

  it('returns false when no HowTo', () => {
    expect(extractSchemaHowTo(noSchema).present).toBe(false);
  });
});

describe('extractSchemaBreadcrumb', () => {
  it('detects BreadcrumbList type', () => {
    expect(extractSchemaBreadcrumb(withSchema('BreadcrumbList')).present).toBe(true);
  });

  it('returns false when no BreadcrumbList', () => {
    expect(extractSchemaBreadcrumb(noSchema).present).toBe(false);
  });
});

describe('extractSchemaOpeningHoursSpec', () => {
  it('detects OpeningHoursSpecification type', () => {
    expect(extractSchemaOpeningHoursSpec(withSchema('OpeningHoursSpecification')).present).toBe(true);
  });

  it('detects nested type inside LocalBusiness', () => {
    const html = withSchema({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      'openingHoursSpecification': { '@type': 'OpeningHoursSpecification', 'dayOfWeek': 'Monday' },
    });
    expect(extractSchemaOpeningHoursSpec(html).present).toBe(true);
  });

  it('returns false when no OpeningHoursSpecification', () => {
    expect(extractSchemaOpeningHoursSpec(noSchema).present).toBe(false);
  });
});

describe('extractSchemaPerson', () => {
  it('detects Person type', () => {
    expect(extractSchemaPerson(withSchema('Person')).present).toBe(true);
  });

  it('returns false when no Person', () => {
    expect(extractSchemaPerson(noSchema).present).toBe(false);
  });
});

describe('extractSchemaReview', () => {
  it('detects Review type', () => {
    expect(extractSchemaReview(withSchema('Review')).present).toBe(true);
  });

  it('detects AggregateRating type', () => {
    expect(extractSchemaReview(withSchema('AggregateRating')).present).toBe(true);
  });

  it('returns false when no review type', () => {
    expect(extractSchemaReview(noSchema).present).toBe(false);
  });
});

describe('extractSchemaProduct', () => {
  it('detects Product type', () => {
    expect(extractSchemaProduct(withSchema('Product')).present).toBe(true);
  });

  it('returns false when no Product', () => {
    expect(extractSchemaProduct(noSchema).present).toBe(false);
  });
});

describe('extractSchemaService', () => {
  it('detects Service type', () => {
    expect(extractSchemaService(withSchema('Service')).present).toBe(true);
  });

  it('returns false when no Service', () => {
    expect(extractSchemaService(noSchema).present).toBe(false);
  });
});
