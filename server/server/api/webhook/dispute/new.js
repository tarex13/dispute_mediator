import { prepare } from "../../../lib/http.js";

export default async function handler(req, res){
    if (!prepare(req, res, 'POST')) return;
    const {id, create_time, reason, dispute_amount} = req.body;
    console.log(id, create_time, reason, dispute_amount.value);
    return res.status(200).json({ok: true});
}