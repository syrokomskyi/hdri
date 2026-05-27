import { describe, it, expect } from 'vitest';
import {
  extractSocialFacebook,
  extractSocialInstagram,
  extractSocialYoutube,
  extractSocialXing,
  extractSocialLinkedin,
  extractSocialTiktok,
  extractSocialWhatsapp,
  extractSocialPinterest,
  extractSocialTwitter,
} from '../social.js';

const link = (href: string) =>
  `<html><body><a href="${href}">Follow us</a></body></html>`;

const noLinks = `<html><body><p>Kontakt: info@example.de</p></body></html>`;

describe('extractSocialFacebook', () => {
  it('detects facebook.com link', () => {
    const r = extractSocialFacebook(link('https://www.facebook.com/mybusiness'));
    expect(r.present).toBe(true);
    expect(r.url).toBe('https://www.facebook.com/mybusiness');
    expect(r.confidence).toBe(95);
  });

  it('detects fb.com short link', () => {
    expect(extractSocialFacebook(link('https://fb.com/page')).present).toBe(true);
  });

  it('returns false on page without facebook link', () => {
    expect(extractSocialFacebook(noLinks).present).toBe(false);
  });

  it('does NOT false-positive on unrelated domain containing "face"', () => {
    expect(extractSocialFacebook(link('https://interface.de/')).present).toBe(false);
  });
});

describe('extractSocialInstagram', () => {
  it('detects instagram.com link', () => {
    expect(extractSocialInstagram(link('https://instagram.com/mybiz')).present).toBe(true);
  });

  it('returns false on page without instagram link', () => {
    expect(extractSocialInstagram(noLinks).present).toBe(false);
  });
});

describe('extractSocialYoutube', () => {
  it('detects youtube.com link', () => {
    expect(extractSocialYoutube(link('https://www.youtube.com/channel/abc')).present).toBe(true);
  });

  it('detects youtu.be short link', () => {
    expect(extractSocialYoutube(link('https://youtu.be/abc123')).present).toBe(true);
  });

  it('returns false on page without youtube link', () => {
    expect(extractSocialYoutube(noLinks).present).toBe(false);
  });
});

describe('extractSocialXing', () => {
  it('detects xing.com link', () => {
    expect(extractSocialXing(link('https://www.xing.com/profile/Max_Mustermann')).present).toBe(true);
  });

  it('returns false on page without xing link', () => {
    expect(extractSocialXing(noLinks).present).toBe(false);
  });
});

describe('extractSocialLinkedin', () => {
  it('detects linkedin.com link', () => {
    expect(extractSocialLinkedin(link('https://www.linkedin.com/company/myco')).present).toBe(true);
  });

  it('returns false on page without linkedin link', () => {
    expect(extractSocialLinkedin(noLinks).present).toBe(false);
  });
});

describe('extractSocialTiktok', () => {
  it('detects tiktok.com link', () => {
    expect(extractSocialTiktok(link('https://www.tiktok.com/@mybrand')).present).toBe(true);
  });

  it('returns false on page without tiktok link', () => {
    expect(extractSocialTiktok(noLinks).present).toBe(false);
  });
});

describe('extractSocialWhatsapp', () => {
  it('detects wa.me link', () => {
    expect(extractSocialWhatsapp(link('https://wa.me/4915112345678')).present).toBe(true);
  });

  it('detects api.whatsapp.com link', () => {
    expect(extractSocialWhatsapp(link('https://api.whatsapp.com/send?phone=49123')).present).toBe(true);
  });

  it('returns false on page without whatsapp link', () => {
    expect(extractSocialWhatsapp(noLinks).present).toBe(false);
  });
});

describe('extractSocialPinterest', () => {
  it('detects pinterest.com link', () => {
    expect(extractSocialPinterest(link('https://www.pinterest.com/myboard')).present).toBe(true);
  });

  it('detects pinterest.de link', () => {
    expect(extractSocialPinterest(link('https://www.pinterest.de/myboard')).present).toBe(true);
  });

  it('returns false on page without pinterest link', () => {
    expect(extractSocialPinterest(noLinks).present).toBe(false);
  });
});

describe('extractSocialTwitter', () => {
  it('detects twitter.com link', () => {
    expect(extractSocialTwitter(link('https://twitter.com/mybrand')).present).toBe(true);
  });

  it('detects x.com link', () => {
    expect(extractSocialTwitter(link('https://x.com/mybrand')).present).toBe(true);
  });

  it('returns false on page without twitter link', () => {
    expect(extractSocialTwitter(noLinks).present).toBe(false);
  });
});
