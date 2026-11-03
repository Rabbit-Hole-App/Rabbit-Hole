// The approved campaign ids for creator analytics. To add a campaign, add its id here: the browser sends only these and the server stores
// only these (publication-analytics.js). Anything else in utm_campaign is ignored, so a query string can never put a name or address in a tag.
export const APPROVED_CAMPAIGNS = Object.freeze(['linkedin-launch']);
export const approvedCampaign = value => (typeof value === 'string' && APPROVED_CAMPAIGNS.includes(value.toLowerCase()) ? value.toLowerCase() : null);
