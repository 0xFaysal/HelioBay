import { AdminUsers } from "@/components/credit/admin-users";
export default async function Page({params}:{params:Promise<{userId:string}>}){const {userId}=await params;return <AdminUsers id={userId}/>;}
