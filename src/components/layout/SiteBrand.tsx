import backgroundLogoUrl from '@/assets/logos/background-logo.png';

export default function SiteBrand() {
  return (
    <>
      <img
        alt=""
        aria-hidden="true"
        className="site-brand-icon"
        src={backgroundLogoUrl}
      />
      <span className="site-brand-name">ZOJ</span>
    </>
  );
}
