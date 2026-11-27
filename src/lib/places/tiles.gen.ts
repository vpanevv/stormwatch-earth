/**
 * Manifest of the offline town tiles in public/places/202611121945/t (5° tiles of GeoNames settlements).
 * Copied from Watched (https://github.com/dev-Armaan/satellites, MIT, © 2026 Armaan Gupta), which builds them from
 * GeoNames (CC BY 4.0). Do not edit by hand.
 */
export const PLACES_VERSION = "202611121945";
/** Bitmap, base64: bit i set when tile i (row × 72 + col) has a file. */
export const PLACE_TILES = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgEQAAAAAAAABgAAAABABgAQDgAAAAAADiAADgAQIAAIjHAADgA4AHANhHAELgB4A3AHwncwLgD8C/ANw35wHwH8S/AfCzRwDwH8D/gPK1ggH4P8IPBP+fAAD+P+CfhP/nEAD4A+w/hH9kAAD8A/5/3Pt/AAD+gf9/3DtzMMD/wP/9/B8CEOA/APv9/j8AAPAfAP///38BAPifAP3///8AAPg/YPz///8BAPj/APz///8DAPz/A/z///8DBP77Af7///8JOP/TAPz///89/j17hv//z/+vT19NksPfL9T3WABUAwRHEKUCAABAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
/** Tiles written as four quarters (`<i>-<q>`), because they hold too many towns for one file. */
export const PLACE_TILES_SPLIT = "1209,1210,1402,1403,1500,1528,1529,1599,1600,1715,1892,1893,1906,1907,1908,1909,1910,1911,1912,1913,1979,1980,1981,1982,1983,1984,1985,1986,2051,2052,2053,2054,2055";
