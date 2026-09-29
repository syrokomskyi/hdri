/*
<MODULE_CONTRACT><purpose>Emit exact validated availability download bytes as static JSON and CSV endpoints.</purpose><non-goals><item>Does not read private candidates or perform publication admission.</item></non-goals></MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0115: serve manifest-bound aggregate downloads without reserialization.</item></CHANGE_SUMMARY>
*/
import type { APIRoute } from "astro";
import { loadAvailabilityPeriods } from "../../../data/dashboard-data";

export function getStaticPaths() {
  return loadAvailabilityPeriods().flatMap(data => (["json", "csv"] as const).map(format => ({
    params: { file: `${data.row.period}.${format}` },
    props: { bytes: data[format], format },
  })));
}
export const GET: APIRoute = ({ props }) => new Response(props.bytes, {
  headers: { "Content-Type": props.format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8" },
});
