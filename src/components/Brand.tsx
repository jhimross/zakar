// Zakar brand: app icon mark and wordmark (Hebrew zakar = "to remember").
// The Z carries a bookmark ribbon. Wordmark outlined from Inter Display SemiBold.

/** Rounded-square app icon (cedar with a cream Z and gold ribbon). */
export function BrandMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={`brand-mark ${className}`} width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id="zk-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#24473B" /><stop offset="1" stopColor="#16302A" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="114" fill="url(#zk-bg)" />
      <path d="M300 274 H356 V414 L328 388 L300 414 Z" fill="#D9A43A" />
      <polygon points="140,102 372,102 372,158 222,274 372,274 372,330 140,330 140,274 290,158 140,158" fill="#F6F1E6" stroke="#F6F1E6" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** "Zakar" wordmark. Text uses currentColor so it follows light/dark mode. */
export function Wordmark({ height = 18, className = '' }: { height?: number; className?: string }) {
  const [, , w, h] = '0 0 413.2 168.0'.split(' ').map(Number);
  return (
    <svg className={`wordmark ${className}`} height={height} width={(height * w) / h} viewBox="0 0 413.2 168.0" role="img" aria-label="Zakar">
      <g transform="translate(0.00 120.00) scale(0.08054)">
        <path d="M887 -149 H1200 V596 L1044 432 L887 596 Z" fill="#D9A43A" />
        <path d="M55 0H1230V-229H378C432 -293 486 -356 537 -420L1222 -1280V-1490H81V-1261H904C852 -1202 802 -1142 754 -1083L55 -210ZM1678.04 17C1850.04 17 1939.04 -55 1989.04 -149H1993.04V0H2241.04V-720C2241.04 -940 2078.04 -1077 1803.04 -1077C1527.04 -1077 1355.04 -938 1343.04 -728H1586.04C1593.04 -817 1675.04 -881 1798.04 -881C1919.04 -881 1991.04 -817 1991.04 -727V-719C1991.04 -647 1924.04 -644 1728.04 -622C1510.04 -599 1313.04 -540 1313.04 -300C1313.04 -89 1468.04 17 1678.04 17ZM1740.04 -170C1630.04 -170 1559.04 -219 1559.04 -302C1559.04 -398 1651.04 -437 1759.04 -453C1863.04 -469 1961.04 -485 1992.04 -505V-391C1992.04 -268 1905.04 -170 1740.04 -170ZM2423.08 0H2675.08V-353L2771.08 -452L3117.08 0H3418.08L2963.08 -600L3392.08 -1056H3089.08L2678.08 -628H2675.08V-1490H2423.08ZM3802.12 17C3974.12 17 4063.12 -55 4113.12 -149H4117.12V0H4365.12V-720C4365.12 -940 4202.12 -1077 3927.12 -1077C3651.12 -1077 3479.12 -938 3467.12 -728H3710.12C3717.12 -817 3799.12 -881 3922.12 -881C4043.12 -881 4115.12 -817 4115.12 -727V-719C4115.12 -647 4048.12 -644 3852.12 -622C3634.12 -599 3437.12 -540 3437.12 -300C3437.12 -89 3592.12 17 3802.12 17ZM3864.12 -170C3754.12 -170 3683.12 -219 3683.12 -302C3683.12 -398 3775.12 -437 3883.12 -453C3987.12 -469 4085.12 -485 4116.12 -505V-391C4116.12 -268 4029.12 -170 3864.12 -170ZM4547.16 0H4799.16V-598C4799.16 -763 4892.16 -846 5012.16 -846C5062.16 -846 5112.16 -841 5131.16 -838V-1062C5111.16 -1064 5083.16 -1066 5049.16 -1066C4913.16 -1066 4832.16 -1002 4793.16 -881H4790.16V-1056H4547.16Z" fill="currentColor" />
      </g>
    </svg>
  );
}
