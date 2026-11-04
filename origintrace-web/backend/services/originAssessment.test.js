import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessOrigin,buildLifeHistory,ORIGIN_STATUSES} from './footageHistory.js';
import {renderLifeHistory,originAssessment} from '../../frontend/src/footageHistory.js';
import {renderFootageTimeline} from '../../frontend/src/reportView.js';
const upload=(url='https://example.com/upload',uploadedAt='2020-01-01')=>({url,uploadedAt,title:'Matching clip',
 footageMatch:{status:'confirmed',method:'reviewed-sequence-match',verifiedBy:'reviewer-1',evidenceUrl:'https://example.com/review'},
 timestamp:{status:'verified',method:'platform-api',verifiedBy:'platform-verifier',evidenceUrl:url}});
const creator={creator:'Creator A',uploadUrl:'https://example.com/upload',reviewedBy:'reviewer-2',evidenceUrls:['https://example.com/original-file','https://example.com/corroboration']};
test('old related articles and model-related assessments do not establish uploader',()=>{
 const h=buildLifeHistory({sources:[{url:'https://example.com/article',publishedAt:'2011-05-15',matchStatus:'related',metaComparison:{assessment:'related'}}]});
 assert.equal(h.originalOrigin.status,ORIGIN_STATUSES.unknown);assert.deepEqual(h.originalOrigin.findings,[]);
});
test('a reviewed footage match and verified upload date establish earliest located matching upload only',()=>{
 const result=assessOrigin({originEvidence:{matchingUploads:[upload('https://example.com/new','2022-01-01'),upload()]}});
 assert.equal(result.status,ORIGIN_STATUSES.earliest);assert.equal(result.earliestMatchingUpload.url,'https://example.com/upload');
 assert.match(result.qualification,/globally first upload remain unproven/);
});
test('earlier upload requires a different post and strictly earlier supported date',()=>{
 const originEvidence={matchingUploads:[upload()]};
 assert.equal(assessOrigin({inputUrl:'https://example.com/submitted',clipPublication:'2024-01-01',originEvidence}).status,ORIGIN_STATUSES.earlier);
 for(const clipPublication of [null,'invalid','2020-01-01','2019-01-01'])assert.equal(assessOrigin({inputUrl:'https://example.com/submitted',clipPublication,originEvidence}).status,ORIGIN_STATUSES.earliest);
 assert.equal(assessOrigin({inputUrl:'https://example.com/upload',clipPublication:'2024-01-01',originEvidence}).status,ORIGIN_STATUSES.earliest);
 const instagramEvidence={matchingUploads:[upload('https://www.instagram.com/reel/abc/')]};
 assert.equal(assessOrigin({inputUrl:'https://www.instagram.com/reels/abc/?igsh=test',clipPublication:'2024-01-01',originEvidence:instagramEvidence}).status,ORIGIN_STATUSES.earliest);
});
test('creator attribution requires matching footage and reviewed corroboration; simultaneous findings survive',()=>{
 const originEvidence={matchingUploads:[upload()],creatorAttributions:[creator]};
 assert.equal(assessOrigin({originEvidence}).status,ORIGIN_STATUSES.creator);
 const all=assessOrigin({inputUrl:'https://example.com/submitted',clipPublication:'2024-01-01',originEvidence});
 assert.equal(all.status,ORIGIN_STATUSES.earlier);assert.equal(all.findings.length,3);
 for(const invalid of [{...creator,reviewedBy:''},{...creator,evidenceUrls:['https://example.com/a','https://example.com/a']},{...creator,uploadUrl:'https://example.com/unmatched'}])
  assert.equal(assessOrigin({originEvidence:{matchingUploads:[upload()],creatorAttributions:[invalid]}}).status,ORIGIN_STATUSES.earliest);
});
test('incomplete, future, unsafe and model-only match evidence cannot promote status',()=>{
 for(const bad of [{...upload(),uploadedAt:'2999-01-01'},{...upload(),uploadedAt:'invalid'},{...upload(),url:'javascript:bad'},
  {...upload(),footageMatch:{status:'confirmed',method:'model-confidence',verifiedBy:'model',evidenceUrl:'https://example.com/review'}},
  {...upload(),timestamp:{status:'verified',method:'search-snippet',verifiedBy:'search',evidenceUrl:'https://example.com/search'}},
  {...upload(),footageMatch:{...upload().footageMatch,verifiedBy:''}}])
  assert.equal(assessOrigin({originEvidence:{matchingUploads:[bad]}}).status,ORIGIN_STATUSES.unknown);
});
test('overview and full report share the status, show evidence links, and migrate legacy labels',()=>{
 const h=buildLifeHistory({inputUrl:'https://example.com/submitted',clipPublication:'2024-01-01',originEvidence:{matchingUploads:[upload()],creatorAttributions:[creator]}});
 assert.ok(renderFootageTimeline(h).includes('earlier upload found'));
 assert.ok(renderFootageTimeline(h).includes('MATCHING UPLOAD'));
 assert.equal(h.timeline[0].date,'2020-01-01T00:00:00.000Z');
 const full=renderLifeHistory(h);assert.ok(full.includes('creator attribution supported'));assert.ok(full.includes('https://example.com/corroboration'));
 assert.equal(originAssessment({originalOrigin:{status:'unestablished'}}).status,ORIGIN_STATUSES.unknown);
});
