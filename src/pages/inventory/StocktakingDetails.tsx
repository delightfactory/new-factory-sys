import { useNavigate, useParams } from 'react-router-dom';
import StocktakingSession from './StocktakingSession';
export default function StocktakingDetails() {
    const {id} = useParams(), navigate = useNavigate();
    if (!id || !/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) return <p role="alert">رابط جلسة الجرد غير صحيح.</p>;
    return <StocktakingSession key={id} sessionId={Number(id)} onBack={() => navigate('/inventory/stocktaking')}/>;
}
