import CompanyVerification from '../models/admin_models/CompanyVerification.js';

export async function handleWebhook(req, res) {
  try {
    const payload = req.body;
    const referenceId = payload.reference_id || payload.referenceId;
    if (!referenceId) return res.status(400).send('missing reference');

    const v = await CompanyVerification.findOne({ $or: [
      { 'pan.data.reference_id': referenceId },
      { 'bank.data.reference_id': referenceId },
      { 'companyBank.data.reference_id': referenceId }
    ]});

    if (!v) return res.status(404).send('not found');

    const fields = ['pan','bank','companyBank'];
    for (const f of fields) {
      if (v[f]?.data?.reference_id === referenceId || v[f]?.data?.referenceId === referenceId) {
        v[f].data = payload;
        v[f].status = (payload.status === 'VERIFIED' || payload.valid === true) ? 'verified'
          : (payload.status === 'FAILED' || payload.valid === false) ? 'rejected' : 'pending';
      }
    }
    await v.save();
    return res.status(200).send('ok');
  } catch (err) {
    console.error('webhook error', err);
    return res.status(500).send('error');
  }
}
