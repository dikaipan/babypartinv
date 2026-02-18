import { supabase } from '../config/supabase';

async function checkUsers() {
    const { data: users, error } = await supabase.from('profiles').select('*');
    if (error) {
        console.error('Error fetching users:', error);
        return;
    }
    console.log('Users found:', users);
}

checkUsers();
