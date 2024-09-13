exports.test_module  = function(){

    var test_module = {

        foo: "bar",
    
        doThis(){
            this.foo = "changed";
            return "here you go";
    
        }
    
    }

    return test_module;    

}